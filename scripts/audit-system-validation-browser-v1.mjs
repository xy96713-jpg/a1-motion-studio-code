#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const generatedRoot=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1");
const candidateRoot=path.join(generatedRoot,"system-validation-candidate-v1");
const reportPath=path.join(candidateRoot,"report.json");
const manifestPath=path.join(candidateRoot,"insertion-manifest.json");
const phasePath=path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath=path.join(generatedRoot,"workspace.json");
const baseUrl=String(process.argv[2]||process.env.A1_SYSTEM_LINE_URL||"http://127.0.0.1:4311").replace(/\/$/u,"");
const pageUrl=`${baseUrl}/system-line-visual-workbench`;
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before={phaseSha256:sha(phasePath),workspaceSha256:sha(workspacePath)};
const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
assert.equal(report.boundary.userVisualApproval,"NOT_APPROVED");
assert.equal(report.boundary.productionEligible,false);
assert.equal(manifest.entryCount,13);
assert.equal(manifest.typographyCoverage.candidateEditableSpecReadyCount,13);
assert.equal(manifest.typographyCoverage.canonicalEditableLayerReadyCount,4);
assert.equal(manifest.deliveryCoverage.alphaOverlayCount,2);
assert.equal(manifest.semanticMotionCoverage.allRepresentativeShotsMultiActor,true);

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const consoleErrors=[];const pageErrors=[];
  page.on("console",(message)=>{if(message.type()==="error")consoleErrors.push(message.text());});
  page.on("pageerror",(error)=>pageErrors.push(error.message));
  const navigation=await page.goto(pageUrl,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(navigation?.status(),200);
  const panel=page.locator('[data-a1-system-validation-candidate="ready"]');
  await panel.waitFor({state:"visible",timeout:20000});
  assert.equal(await panel.getAttribute("data-a1-user-visual-approval"),"NOT_APPROVED");
  const body=await page.locator("body").innerText();
  assert.match(body,/系统已跑完整候选闭环/u);
  assert.match(body,/USER NOT APPROVED/u);
  assert.match(body,/productionEligible=false/u);
  assert.match(body,/13 镜候选几何 \/ 4 镜正式可编辑层/u);
  assert.match(body,/透明叠加 2 · 不透明替换 11/u);
  assert.match(body,/candidate editable spec=13\/13/u);
  assert.match(body,/canonical editable layer=4\/13/u);
  assert.equal(await page.locator('[data-a1-insertion-manifest-link="true"]').getAttribute("href"),report.insertionManifest.publicUrl);

  const videoResults=[];
  for(const id of ["whole-film","five-genre"]){
    const video=page.locator(`[data-a1-system-validation-video="${id}"]`);
    await video.evaluate((element)=>new Promise((resolve,reject)=>{
      const media=element;
      media.muted=true;
      if(media.readyState>=1)resolve(null);
      else{media.addEventListener("loadedmetadata",()=>resolve(null),{once:true});media.addEventListener("error",()=>reject(new Error(`video metadata failed: ${media.currentSrc}`)),{once:true});media.load();}
    }));
    const metadata=await video.evaluate((element)=>({duration:element.duration,videoWidth:element.videoWidth,videoHeight:element.videoHeight,readyState:element.readyState,currentSrc:element.currentSrc}));
    assert.equal(metadata.videoWidth,960);assert.equal(metadata.videoHeight,540);assert.ok(metadata.duration>10);
    await video.evaluate((element)=>new Promise((resolve,reject)=>{
      element.muted=true;
      const ready=()=>{element.currentTime=1;};
      const done=()=>resolve(null);
      const fail=()=>reject(new Error(`video seek failed: ${element.currentSrc}`));
      element.addEventListener("seeked",done,{once:true});
      element.addEventListener("error",fail,{once:true});
      if(element.readyState>=3)ready();else element.addEventListener("canplay",ready,{once:true});
    }));
    await video.evaluate(async(element)=>{element.muted=true;await element.play();});
    await page.waitForFunction((selector)=>{
      const element=document.querySelector(selector);
      return element instanceof HTMLVideoElement&&element.currentTime>1.1;
    },`[data-a1-system-validation-video="${id}"]`,{timeout:6000});
    const playback=await video.evaluate((element)=>({currentTime:element.currentTime,paused:element.paused}));
    assert.ok(playback.currentTime>1.1,"video must advance after seek and play");
    await video.evaluate((element)=>element.pause());
    videoResults.push({id,...metadata,...playback});
  }

  const resourceUrls=[report.render.fullVideo.publicUrl,report.render.smokeVideo.publicUrl,report.render.contactSheets.representative.publicUrl,report.insertionManifest.publicUrl];
  const resourceProbes=[];
  for(const url of resourceUrls){
    const response=await page.request.get(`${baseUrl}${url}`,{headers:url.endsWith(".mp4")?{Range:"bytes=0-1023"}:{}});
    assert.ok([200,206].includes(response.status()),`${url} must load`);
    resourceProbes.push({url,status:response.status(),contentType:response.headers()["content-type"],contentRange:response.headers()["content-range"]||null});
  }
  await page.reload({waitUntil:"domcontentloaded",timeout:30000});
  await page.locator('[data-a1-system-validation-candidate="ready"]').waitFor({state:"visible",timeout:20000});
  assert.deepEqual(consoleErrors,[]);
  assert.deepEqual(pageErrors,[]);
  const screenshotPath=path.join(candidateRoot,"browser-review-screenshot.png");
  await panel.screenshot({path:screenshotPath});
  const after={phaseSha256:sha(phasePath),workspaceSha256:sha(workspacePath)};
  assert.deepEqual(after,before,"browser review must not mutate canonical authority");
  const bodyReport={contract:"A1SystemValidationBrowserAudit/v1",status:"PASS",pageUrl,httpStatus:navigation.status(),panelStatus:"READY",videoResults,resourceProbes,refreshRecovery:true,consoleErrors,pageErrors,screenshot:{path:path.relative(root,screenshotPath),publicUrl:`/generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1/${path.basename(screenshotPath)}`,sha256:sha(screenshotPath),bytes:fs.statSync(screenshotPath).size},authorityMutationAudit:{before,after,mutated:false},boundary:{userVisualApproval:"NOT_APPROVED",productionEligible:false,resolveWritePerformed:false,finalRender:false}};
  const audit={...bodyReport,auditSha256:crypto.createHash("sha256").update(JSON.stringify(bodyReport)).digest("hex"),generatedAt:new Date().toISOString()};
  const auditPath=path.join(candidateRoot,"browser-audit.json");
  writeJsonAtomic(auditPath,audit);
  console.log(JSON.stringify({status:audit.status,auditPath,auditSha256:audit.auditSha256,videoResults,resourceStatuses:resourceProbes.map((item)=>item.status),refreshRecovery:true,authorityMutated:false},null,2));
}finally{await browser?.close();}
