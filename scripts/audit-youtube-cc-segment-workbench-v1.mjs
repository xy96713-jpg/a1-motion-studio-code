#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertYouTubeCcSegmentManifest} from "../apps/studio-next/src/lib/a1-youtube-cc-segment-manifest-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const phaseRoot=path.join(root,"work/youtube-cc-download-segment-workbench-v1");
const result=JSON.parse(fs.readFileSync(path.join(phaseRoot,"result.json"),"utf8"));
const browserProof=JSON.parse(fs.readFileSync(path.join(phaseRoot,"browser-proof.json"),"utf8"));
const phase=JSON.parse(fs.readFileSync(path.join(phaseRoot,"phase-contract.json"),"utf8"));
const reportPath=path.join(root,"apps/studio-next/public",result.manifest.publicUrl.replace(/^\//u,""));
const manifest=JSON.parse(fs.readFileSync(reportPath,"utf8"));
const current=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"),"utf8"));
const authority=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"),"utf8"));
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const failures=[];const check=(condition,id)=>{if(!condition)failures.push(id);};const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
try{assertYouTubeCcSegmentManifest(manifest);}catch(error){failures.push(`MANIFEST_INVALID:${error instanceof Error?error.message:"invalid"}`);}
check(result.contract==="A1YouTubeCcSegmentWorkbenchQualification/v1"&&result.status==="PASS","RESULT_NOT_PASS");
check(manifest.candidates.length===3&&new Set(manifest.candidates.map((candidate)=>candidate.genre)).size===3,"THREE_GENRES_REQUIRED");
for(const receipt of result.receipts||[]){const source=path.join(root,receipt.sourcePath);const clip=path.join(root,receipt.selectedPath);check(fs.existsSync(source)&&shaFile(source)===receipt.sourceSha256&&fs.statSync(source).size===receipt.sourceBytes,`SOURCE_SHA:${receipt.id}`);check(fs.existsSync(clip)&&shaFile(clip)===receipt.clipSha256,`CLIP_SHA:${receipt.id}`);if(fs.existsSync(clip))check(spawnSync(ffmpeg,["-v","error","-i",clip,"-f","null","-"],{encoding:"utf8",timeout:120000}).status===0,`CLIP_DECODE:${receipt.id}`);check(/creative commons attribution|cc by/iu.test(receipt.license||""),`LICENSE:${receipt.id}`);check(receipt.usedCookies===false&&receipt.usedAccountLogin===false&&receipt.usedPoToken===false,`AUTH_BOUNDARY:${receipt.id}`);}
for(const candidate of manifest.candidates){check(candidate.productionUseAllowed===false,`PRODUCTION_USE:${candidate.id}`);check(candidate.selected.outMs>candidate.selected.inMs&&candidate.selected.fullDecode===true,`RANGE:${candidate.id}`);check(/^\/generated\/system-line\/editorial-asset-workbench-v1\/youtube-cc-media-candidates-v1\//u.test(candidate.selected.publicUrl),`PUBLIC_PATH:${candidate.id}`);}
const sheet=path.join(root,result.contactSheet.path);check(fs.existsSync(sheet)&&shaFile(sheet)===result.contactSheet.sha256,"CONTACT_SHEET_SHA");if(fs.existsSync(sheet)){const metadata=await sharp(sheet).metadata();const stats=await sharp(sheet).stats();check(metadata.width===result.contactSheet.width&&metadata.height===result.contactSheet.height,"CONTACT_SHEET_DIMENSIONS");check(Math.max(...stats.channels.slice(0,3).map((channel)=>channel.stdev))>=8,"CONTACT_SHEET_NOT_VISIBLE");}
for(const key of ["threeGenres","ccOnly","allSourcesDownloaded","allClipsPlayable","exactRanges","workbenchReadOnly","formalAuthorityUnchanged"])check(result.checks?.[key]===true,`RESULT_CHECK:${key}`);check(result.checks?.usedCookies===false&&result.checks?.usedAccountLogin===false&&result.checks?.usedPoToken===false&&result.checks?.storyboardMutation===false&&result.checks?.productionAdmission===false,"RESULT_BOUNDARY");
const surface=fs.readFileSync(path.join(root,"apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"),"utf8");const panel=fs.readFileSync(path.join(root,"apps/studio-next/src/app/system-line-visual-workbench/YouTubeMediaCandidatePanel.tsx"),"utf8");check(surface.includes("<YouTubeMediaCandidatePanel />"),"PANEL_NOT_MOUNTED");check(panel.includes("data-a1-automatic-adoption=\"false\"")&&!/onClick=.*(?:adopt|approve|采用|批准)/iu.test(panel),"PANEL_NOT_READ_ONLY");
check(browserProof.contract==="A1YouTubeCcWorkbenchBrowserProof/v1"&&browserProof.status==="PASS"&&browserProof.count===3,"BROWSER_PROOF_NOT_PASS");check((browserProof.results||[]).every((item)=>item.before?.duration>0&&item.before?.videoWidth>0&&item.after?.currentTime>0&&!item.after?.error)&&!(browserProof.errors||[]).length,"BROWSER_PLAYBACK_FAILED");const browserScreenshot=path.join(root,browserProof.screenshot||"");check(Boolean(browserProof.screenshot)&&fs.existsSync(browserScreenshot),"BROWSER_SCREENSHOT_MISSING");
const runtimeText=(phase.generality?.runtimeFiles||[]).map((file)=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");for(const term of [...(phase.generality?.forbiddenFixtureIds||[]),...(phase.generality?.forbiddenTopicTerms||[])])check(!runtimeText.includes(term),`RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha=current.authority?.workspaceSha256||current.workspaceSha256||null;check(authority.status==="PASS"&&authority.authority?.workspaceSha256===currentSha,"CURRENT_AUTHORITY_CHANGED_OR_STALE");
const body={contract:"A1YouTubeCcSegmentWorkbenchAudit/v1",status:failures.length?"FAIL":"PASS",phaseId:phase.phaseId,resultSha256:result.resultSha256,manifest:result.manifest,contactSheet:result.contactSheet,browserProof:{status:browserProof.status,count:browserProof.count,screenshot:browserProof.screenshot,screenshotSha256:fs.existsSync(browserScreenshot)?shaFile(browserScreenshot):""},checks:result.checks,boundary:result.boundary,failures};const report={...body,auditSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};fs.writeFileSync(path.join(phaseRoot,"audit.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
