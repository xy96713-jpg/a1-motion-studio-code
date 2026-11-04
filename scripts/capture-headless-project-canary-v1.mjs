#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const ffprobe=path.join(root,".tools/bin/ffprobe");
const runId=new Date().toISOString().replace(/[:.]/gu,"-");
const outRoot=path.join(root,"work/headless-project-capture-canary-v1",runId);
const videoDir=path.join(outRoot,"playwright-video");
const rawPath=path.join(outRoot,"project-page.webm");
const cfrPath=path.join(outRoot,"project-page-cfr60.mp4");
const contactPath=path.join(outRoot,"contact-sheet.png");
const reportPath=path.join(outRoot,"report.json");
const baseUrl=process.env.A1_WRITING_WORKBENCH_URL||"http://127.0.0.1:8766/v2/";
const sha256=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
fs.mkdirSync(videoDir,{recursive:true});

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:videoDir,size:{width:1280,height:720}}});
const page=await context.newPage();
const video=page.video();
await page.goto(baseUrl,{waitUntil:"networkidle",timeout:60000});
await page.waitForSelector("#editor",{state:"visible",timeout:60000});
const domIdentity=await page.evaluate(()=>({
  url:location.href,title:document.title,
  editor:Boolean(document.querySelector("#editor")),
  finalReview:Boolean(document.querySelector("#finalReviewButton")),
  presentation:Boolean(document.querySelector("#presentDraft")),
  candidates:Boolean(document.querySelector("#candidateList")),
  controls:[...document.querySelectorAll("button")].map((node)=>node.textContent?.trim()).filter(Boolean),
}));
if(!domIdentity.editor||!domIdentity.finalReview||!domIdentity.presentation||!domIdentity.candidates||!["新主题","保存","导出","演示","收稿"].every((label)=>domIdentity.controls.includes(label))) throw new Error(`headless-project-canary-dom-identity:${JSON.stringify(domIdentity)}`);
await sleep(800);
await page.locator("#presentDraft").click({force:true});
await page.waitForFunction(()=>!document.querySelector("#presentationMode")?.hasAttribute("hidden"));
await sleep(1100);
await page.keyboard.press("Escape");
await sleep(1200);
await context.close();
await video.saveAs(rawPath);
await browser.close();

execFileSync(ffmpeg,["-v","error","-y","-i",rawPath,"-vf","fps=60","-an","-c:v","h264_videotoolbox","-b:v","14M","-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",cfrPath]);
const probe=JSON.parse(execFileSync(ffprobe,["-v","error","-count_frames","-show_entries","stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size","-of","json",cfrPath],{encoding:"utf8"}));
const stream=probe.streams.find((item)=>item.codec_type==="video");
const duration=Number(probe.format.duration); const frameCount=Number(stream.nb_read_frames);
if(stream.width!==1280||stream.height!==720||stream.r_frame_rate!=="60/1"||frameCount<Math.floor(duration*59.5)) throw new Error(`headless-project-canary-cfr-contract:${JSON.stringify(probe)}`);
const decode=spawnSync(ffmpeg,["-v","error","-i",cfrPath,"-f","null","-"],{encoding:"utf8"});
if(decode.status!==0) throw new Error(`headless-project-canary-decode:${decode.stderr}`);
execFileSync(ffmpeg,["-v","error","-y","-i",cfrPath,"-vf","fps=1,scale=480:270,tile=4x1","-frames:v","1",contactPath]);
const report={contract:"A1HeadlessProjectCaptureCanary/v1",status:"PASS",captureScope:"BROWSER_PAGE_VIEWPORT_ONLY",desktopCapturePossible:false,headedWindowCreated:false,domIdentity,raw:{path:path.relative(root,rawPath),sha256:sha256(rawPath)},cfr60:{path:path.relative(root,cfrPath),sha256:sha256(cfrPath),width:stream.width,height:stream.height,rFrameRate:stream.r_frame_rate,frameCount,durationSeconds:duration,fullDecodePass:true},evidence:{contactSheet:path.relative(root,contactPath)},boundary:{productionWorkspaceMutation:false,currentPhaseMutation:false,formalArticleMutated:false,productionAdmission:false,userVisualApproval:"NOT_APPROVED"},generatedAt:new Date().toISOString()};
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({...report,reportPath:path.relative(root,reportPath)},null,2));
