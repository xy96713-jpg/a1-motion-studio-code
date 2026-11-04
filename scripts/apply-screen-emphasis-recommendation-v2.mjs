import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root=path.resolve(import.meta.dirname,".."), appRoot=path.join(root,"apps/studio-next"), publicRoot=path.join(appRoot,"public"),
  phase="generated/system-line/editorial-asset-workbench-v1", recommendationRel=`${phase}/screen-emphasis-recommendation-v2`,
  recommendationDir=path.join(publicRoot,recommendationRel), reportPath=path.join(recommendationDir,"report.json"),
  outputRel=`${phase}/screen-storyboard-wave-15-v1/emphasis-filled-v2`, outputDir=path.join(publicRoot,outputRel),
  artifactDir=path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/emphasis-filled-v2"),
  ffmpeg=path.join(root,".tools/bin/ffmpeg");
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  shaValue=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  esc=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

assert.ok(fs.existsSync(reportPath),"screen-emphasis-recommendation-report-required");
const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
assert.equal(report.contract,"A1ScreenEmphasisRecommendation/v2");
assert.equal(report.audit?.status,"PASS");
fs.mkdirSync(outputDir,{recursive:true}); fs.mkdirSync(artifactDir,{recursive:true});

const workspace=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)), authority=workspace.production.shotIntelligence.currentStoryboardAuthority,
  expected=new Set(report.appliedShotIds), outputs=new Map(report.outputs.map((item)=>[item.shotId,item])), filled=[];
assert.deepEqual(new Set(outputs.keys()),expected,"every-apply-shot-must-have-rendered-output");
assert.equal(authority.screenStoryboardWave?.approval?.status??"NOT_APPROVED","NOT_APPROVED","cannot-replace-approved-screen-storyboard-wave");

for(const shotId of report.appliedShotIds){
  const shot=authority.shots.find((item)=>item.shotId===shotId), screen=shot?.screenStoryboard, output=outputs.get(shotId), spec=report.specs.find((item)=>item.shotId===shotId);
  assert.ok(screen&&output&&spec,`screen-emphasis-fill-input-required:${shotId}`);
  assert.equal(screen.emphasisSpec?.specSha256,spec.specSha256,`screen-emphasis-spec-drift:${shotId}`);
  const source=path.join(publicRoot,output.video.publicUrl.replace(/^\//u,"")); assert.ok(fs.existsSync(source),`screen-emphasis-video-missing:${shotId}`); assert.equal(shaFile(source),output.video.sha256,`screen-emphasis-video-sha-drift:${shotId}`);
  const video=path.join(outputDir,`${shotId}-${spec.effect.family.toLowerCase()}-${output.video.sha256.slice(0,12)}.mp4`); fs.copyFileSync(source,video);
  const duration=output.video.durationMs, times={setup:Math.min(180,duration*.08),action:Math.min(duration-500,Math.max(250,(spec.effect.timing.startMs+spec.effect.timing.endMs)/2)),result:Math.max(250,duration-350)}, frames={};
  for(const [state,timeMs] of Object.entries(times)){const file=path.join(outputDir,`${shotId}-${state}.png`);execFileSync(ffmpeg,["-v","error","-y","-ss",(timeMs/1000).toFixed(3),"-i",video,"-frames:v","1",file]);frames[state]={publicUrl:`/${outputRel}/${path.basename(file)}`,sha256:shaFile(file),timeMs:Math.round(timeMs)};}
  const tileW=480,tileH=270,labelH=82, notes=[`SETUP · ${(screen.actionContract?.before||"进入真实工作台并稳定画面").slice(0,46)}`,`ACTION · ${(screen.actionContract?.hold||"只完成一个主要动作").slice(0,46)}`,`RESULT · ${(screen.actionContract?.after||"结果留在原位并稳定停留").slice(0,46)}`], composites=[];
  for(let i=0;i<3;i++){const frame=path.join(publicRoot,Object.values(frames)[i].publicUrl.replace(/^\//u,"")), label=Buffer.from(`<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#111516"/><text x="14" y="25" fill="#dfff68" font-family="Arial" font-size="14" font-weight="700">${["SETUP","ACTION","RESULT"][i]}</text><text x="14" y="50" fill="#d9dedb" font-family="Arial" font-size="12">${esc(notes[i].slice(notes[i].indexOf("·")+2))}</text><text x="14" y="70" fill="#7f8a84" font-family="monospace" font-size="10">${Math.round(Object.values(times)[i])}ms · ${spec.effect.family}</text></svg>`);composites.push(await sharp(frame).resize(tileW,tileH,{fit:"cover"}).extend({top:labelH,bottom:0,left:0,right:0,background:"#111516"}).composite([{input:label,left:0,top:0}]).png().toBuffer());}
  const headerH=78, board=path.join(outputDir,`${shotId}-screen-storyboard.png`), header=Buffer.from(`<svg width="${tileW*3}" height="${headerH}"><rect width="100%" height="100%" fill="#090c0d"/><text x="20" y="30" fill="#f2f4ef" font-family="Arial" font-size="18" font-weight="700">${esc(`${shotId} · ${screen.sourceText||""}`.slice(0,72))}</text><text x="20" y="57" fill="#8faeff" font-family="Arial" font-size="12">PIXEL FILLED · ${spec.effect.family} · USER REVIEW STILL REQUIRED</text></svg>`);
  await sharp({create:{width:tileW*3,height:headerH+tileH+labelH,channels:4,background:"#090c0d"}}).composite([{input:header,left:0,top:0},...composites.map((input,index)=>({input,left:index*tileW,top:headerH}))]).png().toFile(board);
  filled.push({shotId,effectFamily:spec.effect.family,specSha256:spec.specSha256,video:{publicUrl:`/${outputRel}/${path.basename(video)}`,sha256:shaFile(video),width:output.video.width,height:output.video.height,durationMs:duration},frames,board:{publicUrl:`/${outputRel}/${path.basename(board)}`,sha256:shaFile(board),width:1440,height:430}});
}

const generatedAt=new Date().toISOString(), fillReport={contract:"A1ScreenEmphasisPixelFill/v1",status:"READY_FOR_USER_SHOT_BY_SHOT_REVIEW",sourceRecommendationSha256:shaFile(reportPath),filledShotIds:filled.map((item)=>item.shotId),filled,boundaries:{userVisualApproval:"NOT_APPROVED",productionAdmission:false,wholeFilmRenderPerformed:false,resolveWritePerformed:false},generatedAt};
fillReport.fillSha256=shaValue(fillReport); fs.writeFileSync(path.join(outputDir,"report.json"),`${JSON.stringify(fillReport,null,2)}\n`);
for(const name of fs.readdirSync(outputDir).filter((item)=>/\.(json|png|mp4)$/u.test(item)))fs.copyFileSync(path.join(outputDir,name),path.join(artifactDir,name));
const committed=await withProjectLock(appRoot,async()=>{const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));assert.equal(current.workspaceSha256,workspace.workspaceSha256,"screen-emphasis-fill-cas");let next=structuredClone(current), currentAuthority=next.production.shotIntelligence.currentStoryboardAuthority;for(const item of filled){const shot=currentAuthority.shots.find((candidate)=>candidate.shotId===item.shotId), screen=shot.screenStoryboard;screen.video=item.video;screen.frames=item.frames;screen.board=item.board;screen.reviewStatus="READY_FOR_USER_SHOT_BY_SHOT_REVIEW";screen.pixelFill={contract:fillReport.contract,status:"PASS",effectFamily:item.effectFamily,specSha256:item.specSha256,videoSha256:item.video.sha256,boardSha256:item.board.sha256,fillSha256:fillReport.fillSha256};screen.versionId=`${item.shotId.toLowerCase()}-emphasis-${item.video.sha256.slice(0,12)}`;screen.revisionSha256=shaValue({shotId:item.shotId,video:item.video,frames:item.frames,board:item.board,specSha256:item.specSha256});}
  currentAuthority.screenEmphasisPixelFill={contract:fillReport.contract,status:fillReport.status,reportPublicUrl:`/${outputRel}/report.json`,filledShotIds:fillReport.filledShotIds,fillSha256:fillReport.fillSha256,userVisualApproval:"NOT_APPROVED",productionAdmission:false,generatedAt}; next=recalculateEditorialAssetWorkbench(next,generatedAt);const event=createProductionEvent({workspace:current,action:"apply-screen-emphasis-pixel-fill-v2",targetId:fillReport.fillSha256,payload:{filledShotIds:fillReport.filledShotIds,userVisualApproval:"NOT_APPROVED",productionAdmission:false},now:generatedAt});next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;return persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,files:{"screen-storyboard-wave-15-v1/emphasis-filled-v2/report.json":fillReport}});});
console.log(JSON.stringify({status:fillReport.status,filledShotIds:fillReport.filledShotIds,fillSha256:fillReport.fillSha256,workspaceSha256After:committed.workspaceSha256,boundaries:fillReport.boundaries},null,2));
