#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRelativeRoot = "representative-motion-action-storyboard-v1";
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", outputRelativeRoot);
const expectedWorkspaceSha256 = process.argv[2];
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha(fs.readFileSync(file));
const publicPath = (url) => path.join(publicRoot, url.replace(/^\//u, ""));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("action-storyboard-workspace-sha-required");

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`action-storyboard-workspace-cas:${current.workspaceSha256}`);
if (current.production.authority?.nextAction?.id !== "build-representative-motion-action-storyboard" || current.production.motion?.representativeCanary?.status !== "VISUAL_REJECTED_PPT_LIKE") throw new Error("action-storyboard-rejected-canary-authority-required");
const plan = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/approved-master-raster-slice-motion-ir-v1/plan.json"), "utf8"));
const targetShotIds = current.production.motion.representativeCanary.representativeShotIds;
const scenes = targetShotIds.map((shotId) => plan.scenes.find((scene) => scene.shotId === shotId));
if (scenes.some((scene) => !scene)) throw new Error("action-storyboard-scene-missing");
fs.mkdirSync(outputRoot, {recursive: true});

const width = 960, height = 540;
const dim = async (file, amount = .18) => sharp(file).resize(width, height, {fit: "fill"}).modulate({brightness: amount, saturation: .75}).png().toBuffer();
const full = async (file) => sharp(file).resize(width, height, {fit: "fill"}).png().toBuffer();
const reveal = async (file, rectangles, amount = .14) => {
  const source = await full(file);
  const background = await dim(file, amount);
  const composites = [];
  for (const rectangle of rectangles) {
    const left = Math.max(0, Math.round(rectangle.x * width));
    const top = Math.max(0, Math.round(rectangle.y * height));
    const cropWidth = Math.min(width - left, Math.round(rectangle.width * width));
    const cropHeight = Math.min(height - top, Math.round(rectangle.height * height));
    composites.push({input: await sharp(source).extract({left, top, width: cropWidth, height: cropHeight}).png().toBuffer(), left, top});
  }
  return sharp(background).composite(composites).png().toBuffer();
};
const framePlans = {
  "ED-01": {route:"TRUE_GLYPH_LAYERS",actors:["TITLE_GLYPH_PLANES","REGISTRATION_SIGNAL","PRESENTER_OVERLAY"], setup:[{x:.29,y:0,width:.71,height:1}], action:[{x:0,y:0,width:1,height:1}], labels:["全屏标题先建立","字形层拆出并接力","回到真人轻包装状态"]},
  "ED-10": {route:"TRUE_TRANSPARENT_LAYERS",actors:["EXACT_COPY_LEFT","VERDICT_TOOL","WASTE_VERDICT"], setup:[{x:.35,y:.32,width:.28,height:.42}], action:[{x:.24,y:.30,width:.58,height:.46}], labels:["前提文字独立出现","印章工具真实压下","废稿判断锁定并回批准帧"]},
  "ED-17": {route:"XYQ_MOTION_REFERENCE_LOCAL_REBUILD",actors:["MATERIAL_INPUT","ANGLE_SELECTOR","WRITING_HEAD","RESULT_SIGNAL"], setup:[{x:0,y:0,width:.34,height:1}], action:[{x:0,y:0,width:.69,height:1}], labels:["无字机械首帧","小云雀机械因果运动参考","完成状态；本地重建去标记"]},
  "ED-20": {route:"VERIFIED_SCREEN_SOURCE_PLAYBACK",actors:["REAL_SCREEN_VIDEO","STATE_RAIL","SOURCE_SELECTION","RESULT_HOLD"], setup:[{x:0,y:0,width:1,height:1}], action:[{x:.10,y:.06,width:.80,height:.60}], labels:["真实录屏全貌","真实选择区与状态轨同步","操作结果保持可读"]},
  "ED-31": {route:"REAL_PRESENTER_MATTE_AND_WINDOW_LAYERS",actors:["REAL_PRESENTER_VIDEO","CONTROL_WINDOW","LOCK_INDICATOR","PRESENTER_MATTE"], setup:[{x:.48,y:0,width:.52,height:1}], action:[{x:0,y:.10,width:.47,height:.70}], labels:["真人源视频持续","控制窗口在正确 z-order 打开","状态锁定且人物不被重绘"]},
};
const stateSourceOverrides = {
  "ED-01": [
    path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/state-a-fullscreen-title.png"),
    path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/state-b-title-extract-reveal.png"),
    path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/state-c-presenter-light-overlay.png"),
  ],
  "ED-10": ["setup.png","action.png","result.png"].map((name)=>path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-motion-canary-v1/review-frames",name)),
  "ED-17": ["start.png","mid-b.png","end.png"].map((name)=>path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/ed17-xyq-video-canary-v1/review-frames",name)),
};

const stateFiles = [];
const rows = [];
for (const scene of scenes) {
  const sourceFile = publicPath(scene.source.publicUrl);
  if (!fs.existsSync(sourceFile) || shaFile(sourceFile) !== scene.source.sha256) throw new Error(`action-storyboard-source-invalid:${scene.shotId}`);
  const spec = framePlans[scene.shotId];
  if(!spec) throw new Error(`action-storyboard-route-missing:${scene.shotId}`);
  const overrideFiles=stateSourceOverrides[scene.shotId];
  if(overrideFiles?.some((file)=>!fs.existsSync(file))) throw new Error(`action-storyboard-override-missing:${scene.shotId}`);
  const states = overrideFiles ? await Promise.all(overrideFiles.map((file)=>full(file))) : [await full(sourceFile), await reveal(sourceFile, spec.action, .2), await full(sourceFile)];
  const row = {shotId: scene.shotId, sourceSha256: scene.source.sha256, productionRoute:spec.route, actors: spec.actors, states: []};
  for (let index = 0; index < states.length; index += 1) {
    const state = ["SETUP","ACTION","RESULT"][index];
    const file = path.join(outputRoot, `${scene.shotId}-${state.toLowerCase()}.png`);
    fs.writeFileSync(file, states[index]);
    const binding = {state, semanticAction: spec.labels[index], publicUrl: publicUrl(file), sha256: shaFile(file), width, height};
    row.states.push(binding); stateFiles.push({shotId: scene.shotId, ...binding, file});
  }
  rows.push(row);
}

const tileWidth = 480, imageHeight = 270, labelHeight = 74, headerHeight = 112;
const tileBuffers = [];
for (const item of stateFiles) {
  const image = await sharp(item.file).resize(tileWidth, imageHeight, {fit:"fill"}).png().toBuffer();
  const row = rows.find((entry) => entry.shotId === item.shotId);
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0a0e11"/><rect width="7" height="100%" fill="${item.state === "ACTION" ? "#ff5c35" : item.state === "RESULT" ? "#dfff68" : "#6e7c82"}"/><text x="18" y="23" fill="#f3f1e9" font-family="monospace" font-size="16" font-weight="700">${item.shotId} · ${item.state}</text><text x="18" y="44" fill="#bdc9c5" font-family="PingFang SC, sans-serif" font-size="12">${item.semanticAction}</text><text x="18" y="59" fill="#6e7c82" font-family="monospace" font-size="8">${row.productionRoute}</text><text x="18" y="70" fill="#6e7c82" font-family="monospace" font-size="7">${row.actors.join(" / ")}</text></svg>`);
  tileBuffers.push(await sharp({create:{width:tileWidth,height:imageHeight+labelHeight,channels:4,background:"#0a0e11"}}).composite([{input:image,left:0,top:0},{input:label,left:0,top:imageHeight}]).png().toBuffer());
}
const boardWidth = tileWidth * 3, boardHeight = headerHeight + rows.length * (imageHeight + labelHeight);
const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${headerHeight}"><rect width="100%" height="100%" fill="#101619"/><text x="24" y="43" fill="#f3f1e9" font-family="PingFang SC, sans-serif" font-size="29" font-weight="700">五镜动作分镜 · setup → action → result</text><text x="24" y="78" fill="#b9c6c2" font-family="PingFang SC, sans-serif" font-size="16">拒绝整图淡入：每镜必须有独立 actor、因果动作、可读结果；本板通过前禁止重渲染</text><text x="1115" y="78" fill="#ff5c35" font-family="monospace" font-size="13">PPT RISK: BLOCKED</text></svg>`);
const boardFile = path.join(outputRoot, "representative-motion-action-storyboard.png");
await sharp({create:{width:boardWidth,height:boardHeight,channels:4,background:"#080b0d"}}).composite([{input:header,left:0,top:0},...tileBuffers.map((input,index)=>({input,left:(index%3)*tileWidth,top:headerHeight+Math.floor(index/3)*(imageHeight+labelHeight)}))]).png().toFile(boardFile);
const builtAt = new Date().toISOString();
const reportBody = {contract:"A1RepresentativeMotionActionStoryboard/v1",status:"READY_FOR_USER_ACTION_STORYBOARD_REVIEW",sourceRejectedCanaryReportSha256:current.production.motion.representativeCanary.reportSha256,sourcePlanSha256:plan.planSha256,targetShotIds,shotCount:rows.length,stateCount:stateFiles.length,pptRisk:{status:"BLOCKED",wholeRasterFadeOnly:false,independentActorsRequired:true,causalActionRequired:true,setupActionResultRequired:true},routeEvidence:{"ED-10":"TRUE_ALPHA_LAYER_CANARY_RENDERED","ED-17":"XYQ_MINI_LITE_REFERENCE_RENDERED","ED-20":"REAL_SCREEN_ONLY","ED-31":"REAL_PRESENTER_MATTE_REQUIRED"},shots:rows,board:{publicUrl:publicUrl(boardFile),sha256:shaFile(boardFile),width:boardWidth,height:boardHeight},boundaries:{renderPerformed:true,assemblyCreated:false,fullFilmExpansionAllowed:false,userApproval:"PENDING"},builtAt};
const report = {...reportBody,reportSha256:sha({...reportBody,builtAt:undefined})};
fs.writeFileSync(path.join(outputRoot,"report.json"),`${JSON.stringify(report,null,2)}\n`);
const binaryFiles = {[`${outputRelativeRoot}/${path.basename(boardFile)}`]:fs.readFileSync(boardFile),...Object.fromEntries(stateFiles.map((item)=>[`${outputRelativeRoot}/${path.basename(item.file)}`,fs.readFileSync(item.file)]))};
const committed = withProjectLock(appRoot,()=>{
  const locked=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(locked.workspaceSha256!==current.workspaceSha256) throw new Error(`action-storyboard-persist-cas:${locked.workspaceSha256}`);
  let next=structuredClone(locked);
  next.production.motion={...next.production.motion,status:"representative-motion-action-storyboard-review",actionStoryboard:{contract:report.contract,status:report.status,reportSha256:report.reportSha256,targetShotIds,board:report.board,userVisualApproval:"PENDING",renderAllowed:false},updatedAt:builtAt};
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,builtAt));
  if(next.production.authority?.nextAction?.id!=="review-representative-motion-action-storyboard") throw new Error(`action-storyboard-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const event=createProductionEvent({workspace:locked,action:"build-representative-motion-action-storyboard",targetId:report.reportSha256,payload:{status:report.status,reportSha256:report.reportSha256,boardSha256:report.board.sha256,targetShotIds,stateCount:stateFiles.length,renderPerformed:false},now:builtAt});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  return persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:locked.workspaceSha256,commitId:`motion-action-storyboard-${builtAt.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{[`${outputRelativeRoot}/report.json`]:report},binaryFiles});
});
console.log(JSON.stringify({status:report.status,workspaceSha256After:committed.workspaceSha256,reportSha256:report.reportSha256,board:report.board,targetShotIds,stateCount:stateFiles.length,renderPerformed:false},null,2));
