#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = rendererRequire("@remotion/renderer");
const phaseId = "fused-editorial-v2-h47-540p-review-v1";
const staticDir = path.join(root, "apps/studio-next/public/generated/system-line/fused-editorial-v2-full-static-board-v1");
const motionDir = path.join(root, "apps/studio-next/public/generated/system-line/fused-editorial-v2-representative-motion-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, `${JSON.stringify(value,null,2)}\n`); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root,file).split(path.sep).join("/");
const boardReport = read(path.join(staticDir,"report.json")); const boardLedger = read(path.join(staticDir,"full-static-board-review-decisions.json")); const motionReport = read(path.join(motionDir,"report.json")); const motionLedger = read(path.join(motionDir,"representative-motion-review-decisions.json")); const designs = read(path.join(staticDir,"layered-shot-designs.json")).designs;
if (boardLedger.status !== "FULL_STATIC_BOARD_APPROVED_BY_DELEGATE" || boardLedger.summary.approvedCount !== 47) throw new Error("h47-full-540p-blocked-by-static-board");
if (motionLedger.status !== "FULL_REPRESENTATIVE_MOTION_APPROVED_BY_DELEGATE" || motionReport.gates.fullMp4RenderAllowed !== true) throw new Error("h47-full-540p-blocked-by-representative-motion");
fs.mkdirSync(publicDir,{recursive:true}); fs.mkdirSync(artifactDir,{recursive:true});
const serveUrl = await bundle({entryPoint,publicDir:rendererPublicDir,rootDir:rendererRoot,enableCaching:true}); const browser = await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"}); const output = path.join(artifactDir,"h47-full-540p-review.mp4");
try { const inputProps = {designs,shotDurationInFrames:90}; const composition = await selectComposition({serveUrl,id:"A1FusedEditorialV2MotionProof",inputProps,puppeteerInstance:browser,logLevel:"warn"}); await renderMedia({serveUrl,composition,inputProps,frameRange:[0,designs.length*90-1],outputLocation:output,scale:.5,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:86,concurrency:2,hardwareAcceleration:"if-possible",overwrite:true,puppeteerInstance:browser,logLevel:"warn"}); } finally { await browser.close({silent:true}); }
const publicOutput = path.join(publicDir,"h47-full-540p-review.mp4"); fs.copyFileSync(output,publicOutput);
const report = {contract:"A1FusedEditorialV2H47Full540pReport/v1",phaseId,status:"READY_FOR_H47_540P_REVIEW",reviewOnly:true,source:{designBoardSha256:shaFile(path.join(staticDir,"design-board-manifest.json")),shotCount:designs.length},video:{publicUrl:`/generated/system-line/${phaseId}/h47-full-540p-review.mp4`,path:rel(output),sha256:shaFile(output),width:960,height:540,fps:30,frameCount:designs.length*90},gates:{staticBoardApproved:true,representativeMotionApproved:true,full540pReviewRequired:true,final1080ApprovalRequired:true},nextAction:"review-h47-540p-before-maturity-acceptance"};
write(path.join(artifactDir,"report.json"),report); write(path.join(publicDir,"report.json"),report); console.log(JSON.stringify(report,null,2));
