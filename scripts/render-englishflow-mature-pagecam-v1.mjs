#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const source = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/clean-source.mp4");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/englishflow-mature-pagecam-v1");
const publicRelative = "proof-only/mature-pagecam-v1/englishflow-clean-source.mp4";
const publicSource = path.join(publicRoot, publicRelative);
const firstFrame = path.join(outDir, "first-frame.png");
const output = path.join(outDir, "englishflow-mature-pagecam.mp4");
const manifestPath = path.join(outDir, "manifest.json");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
await fsp.mkdir(outDir, {recursive: true}); await fsp.mkdir(path.dirname(publicSource), {recursive: true}); await fsp.copyFile(source, publicSource);
execFileSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-y", "-i", source, "-frames:v", "1", firstFrame]);
await fsp.copyFile(firstFrame, path.join(publicRoot, "proof-only/mature-pagecam-v1/first-frame.png"));
const props = {sourceVideoUri: publicRelative, firstFrameImageUri: "proof-only/mature-pagecam-v1/first-frame.png", sourceFrameCount: 510, nativeDurationInFrames: 510, viewportWidth: 1920, viewportHeight: 1080, keys: [{frame: 0, cx: 960, cy: 540, zoom: 1}, {frame: 250, cx: 960, cy: 540, zoom: 1}, {frame: 310, cx: 1080, cy: 560, zoom: 1.18}, {frame: 380, cx: 1060, cy: 520, zoom: 1.28}, {frame: 509, cx: 1060, cy: 520, zoom: 1.28}], motionProfile: {contract: "A1CinematicScreenCameraMotion/v1", curve: "MINIMUM_JERK", temporalBlur: {enabled: true, maxShutterAngle: 140, samples: 8, activationVelocity: .06}}, muted: true};
const require = createRequire(path.join(rendererRoot, "package.json")); const {bundle} = require("@remotion/bundler"); const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true}); const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"}); const stills = [];
try { const composition = await selectComposition({serveUrl, id: "A1MaturePageCamV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"}); await renderMedia({serveUrl, composition, inputProps: props, outputLocation: output, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"}); for (const sample of [{label: "wide", frame: 100}, {label: "push", frame: 320}, {label: "close-hold", frame: 430}]) {const file=path.join(outDir,`${sample.label}.png`); await renderStill({serveUrl,composition,inputProps:props,frame:sample.frame,output:file,imageFormat:"png",overwrite:true,puppeteerInstance:browser,logLevel:"warn"}); stills.push({label:sample.label,frame:sample.frame,path:path.relative(root,file),sha256:sha(file)});}} finally {await browser.close({silent:true});}
const contact=path.join(outDir,"contact.png"); const thumbs=await Promise.all(stills.map((item)=>sharp(path.join(root,item.path)).resize(640,360,{fit:"cover"}).png().toBuffer())); await sharp({create:{width:1920,height:360,channels:3,background:"#0b0e10"}}).composite(thumbs.map((input,index)=>({input,left:index*640,top:0}))).png().toFile(contact);
const media=probe(output); const video=media.streams.find((item)=>item.codec_type==="video")||media.streams[0]; const decode=execFileSync(path.join(root,".tools/bin/ffmpeg"),["-v","error","-i",output,"-f","null","-"],{encoding:"utf8"});
const manifest={contract:"A1EnglishFlowMaturePageCamManifest/v1",status:"PASS_REVIEW_ONLY",source:{path:path.relative(root,source),sha256:sha(source)},camera:{grammar:"MINIMUM_JERK",keys:props.keys,variableScale:true,peakScale:1.28,returnsToWide:false,temporalBlur:props.motionProfile.temporalBlur,sourcePixelsPreserved:true},output:{path:path.relative(root,output),sha256:sha(output),width:video.width,height:video.height,fps:video.r_frame_rate,durationMs:Math.round(Number(media.format.duration)*1000),fullDecodePass:decode===""},stills,contactSheet:{path:path.relative(root,contact),sha256:sha(contact)},boundary:{reviewOnly:true,productionAdmission:false,syntheticCursor:false,syntheticAnnotations:false,userVisualApproval:"NOT_APPROVED"}}; manifest.manifestSha256=crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"); await fsp.writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`); console.log(JSON.stringify({...manifest,manifestPath:path.relative(root,manifestPath)},null,2));
