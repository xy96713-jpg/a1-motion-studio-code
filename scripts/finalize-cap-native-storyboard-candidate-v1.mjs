#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const shotId=process.env.A1_CAP_NATIVE_SHOT_ID||"ED-04";
const slug=shotId.toLowerCase();
const runTag=process.env.A1_CAP_NATIVE_RUN_TAG||"v1";
if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(runTag)) throw new Error(`cap-native-run-tag-invalid:${runTag}`);
const plan=JSON.parse(fs.readFileSync(path.join(root,"work/cap-native-production-v2/plan.json"),"utf8"));
const shot=plan.shots.find((item)=>item.shotId===shotId);
if (!shot) throw new Error(`cap-candidate-shot-not-in-current-plan:${shotId}`);
const captureRoot=path.join(root,`work/cap-native-${slug.replace("-","")}-${runTag}`);
const reportPath=path.join(captureRoot,"report.json");
const videoPath=path.join(captureRoot,`${slug}-current-storyboard-960x540.mp4`);
if (!fs.existsSync(reportPath)||!fs.existsSync(videoPath)) throw new Error(`cap-candidate-files-missing:${shotId}`);
const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe=JSON.parse(execFileSync(path.join(root,".tools/bin/ffprobe"),["-v","error","-show_entries","stream=width,height,avg_frame_rate,nb_frames:format=duration,size","-of","json",videoPath],{encoding:"utf8"}));
const failures=[];
if (report.sourceWorkspaceSha256!==plan.source.workspaceSha256) failures.push("WORKSPACE_SHA_MISMATCH");
if (report.sourceStoryboardVersionId!==shot.authority.versionId) failures.push("STORYBOARD_VERSION_MISMATCH");
if (report.sourceStoryboardRevisionSha256!==shot.authority.revisionSha256) failures.push("STORYBOARD_REVISION_MISMATCH");
if (report.productIdentityProof?.status!=="PASS") failures.push("PRODUCT_IDENTITY_FAILED");
const virtualDisplayCapture = report.productIdentityProof?.selectionMethod === "DEDICATED_NON_PRIMARY_VIRTUAL_DISPLAY_KIOSK"
  && report.productIdentityProof?.virtualDisplay?.name === "A1 Capture"
  && report.productIdentityProof?.virtualDisplay?.primary === false
  && report.productIdentityProof?.candidateCount === 1;
const dedicatedWindowCapture = report.productIdentityProof?.selectionMethod === "DEDICATED_APP_WINDOW_CAPTURE"
  && report.productIdentityProof?.status === "PASS"
  && report.productIdentityProof?.candidateCount === 1
  && report.captureSafety?.captureScope === "DEDICATED_APP_WINDOW";
if (!virtualDisplayCapture && !dedicatedWindowCapture && (report.productIdentityProof?.selectionMethod!=="ONE_TIME_EXACT_WINDOW_TITLE_HELD_THROUGH_CAPTURE"||report.productIdentityProof?.candidateCount!==1)) failures.push("CAPTURE_IDENTITY_NOT_PROVEN");
if (report.cameraRecipe?.recipeSha256!==shot.execution.cameraRecipe?.recipeSha256) failures.push("CAMERA_RECIPE_MISMATCH");
if (report.narrationBinding?.status!=="PASS") failures.push("NARRATION_BINDING_FAILED");
if (virtualDisplayCapture ? report.captureSafety?.capturedPixelSizeMatchesVirtualDisplay!==true : dedicatedWindowCapture ? report.captureSafety?.capturedPixelSizeMatchesTarget!==true : report.captureSafety?.capturedPixelSizeMatchesWindow!==true) failures.push("CAPTURE_PIXEL_IDENTITY_FAILED");
if (probe.streams?.[0]?.avg_frame_rate!=="60/1") failures.push("FPS_NOT_60");
if (Math.abs(Number(probe.format?.duration||0)*1000-shot.authority.timeRange.durationMs)>200) failures.push("DURATION_MISMATCH");
const body={
  contract:"A1CapNativeStoryboardCandidateReceipt/v1",
  status:failures.length?"BLOCKED":"READY_FOR_USER_SHOT_REVIEW",
  shotId,
  sourceWorkspaceSha256:plan.source.workspaceSha256,
  sourceStoryboardVersionId:shot.authority.versionId,
  sourceStoryboardRevisionSha256:shot.authority.revisionSha256,
  sourceActionId:shot.execution.actionId,
  cameraRecipe:report.cameraRecipe,
  productIdentityProof:report.productIdentityProof,
  narrationBinding:report.narrationBinding,
  video:{path:path.relative(root,videoPath),sha256:sha(videoPath),width:probe.streams[0].width,height:probe.streams[0].height,fps:probe.streams[0].avg_frame_rate,frameCount:Number(probe.streams[0].nb_frames),durationMs:Math.round(Number(probe.format.duration)*1000)},
  userVisualApproval:"NOT_APPROVED",
  productionAdmission:false,
  failures,
};
const receipt={...body,receiptSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
const output=path.join(root,"work/cap-native-production-v2/candidates",shotId,"receipt.json");
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:receipt.status,shotId,outputPath:path.relative(root,output),video:receipt.video,receiptSha256:receipt.receiptSha256,failures},null,2));
if (failures.length) process.exitCode=1;
