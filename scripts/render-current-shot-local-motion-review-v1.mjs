#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertReviewOnlyMotionTiming, assertMotionReviewBinding, motionReviewSource, motionReviewHash, auditShotViewingReadiness} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const shotId = process.argv[2];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const definitions = {
  "ED-01": {background: "#fff", writingSurface: {splitY:530,rise:420,enterEndFrame:24,pulseStartFrame:26,pulseEndFrame:42,caret:{x:1334,y:704,width:64,height:186}}, regions: []},
  "ED-20": {background: "#fff", backgroundTileSize: 16, regions: [
    {id: "material-gather", x: 112, y: 306, width: 630, height: 720, start: 12, duration: 42, travelX: -96, travelY: 24},
    {id: "constraint-upper", x: 744, y: 392, width: 40, height: 140, start: 78, duration: 24, travelX: 0, travelY: 0, emphasisOnly: true},
    {id: "constraint-lower", x: 744, y: 648, width: 40, height: 144, start: 90, duration: 24, travelX: 0, travelY: 0, emphasisOnly: true},
    {id: "document-handoff", x: 866, y: 398, width: 892, height: 508, start: 126, duration: 36, travelY: 28, background: "#fff"},
  ]},
  "ED-12": {background: "#15191a", regions: [
    {id: "GPT", x: 969, y: 102, width: 160, height: 160, start: 6, duration: 12, travelY: 16},
    {id: "Claude", x: 1208, y: 240, width: 155, height: 150, start: 16, duration: 12, travelY: 16},
    {id: "Kimi", x: 1467, y: 92, width: 175, height: 176, start: 26, duration: 12, travelY: 16},
    {id: "DeepSeek", x: 1555, y: 413, width: 177, height: 130, start: 36, duration: 12, travelY: 16},
    {id: "Zhipu", x: 1176, y: 561, width: 330, height: 80, start: 46, duration: 12, travelY: 12},
  ]},
  "ED-14": {background: "#e9eaed", backgroundTileSize: 16, regions: [
    {id: "syntax", x: 1047, y: 122, width: 760, height: 220, start: 33, duration: 16, travelY: 10},
    {id: "lexicon", x: 1047, y: 382, width: 760, height: 219, start: 93, duration: 16, travelY: 10},
    {id: "bounded-conclusion", x: 1076, y: 601, width: 731, height: 352, start: 153, duration: 17, travelY: 10},
  ]},
  "ED-16": {background: "#002e81", regions: [
    {id: "material-input", x: 161, y: 280, width: 497, height: 201, start: 0, duration: 14, travelX: -28},
    {id: "angle-input", x: 269, y: 570, width: 269, height: 272, start: 14, duration: 14, travelX: -28},
    {id: "merge-channel", x: 538, y: 345, width: 460, height: 397, start: 28, duration: 20, travelX: 0},
    {id: "output-block", x: 1002, y: 274, width: 745, height: 568, start: 48, duration: 18, travelY: 18},
  ]},
  "ED-09": {background: "#eceae6", regions: [
    {id: "focus-rail", x: 100, y: 180, width: 640, height: 400, start: 0, duration: 20, travelX: -24},
    {id: "averaged-text", x: 550, y: 178, width: 1370, height: 902, start: 20, duration: 28, revealFrom: "left"},
  ]},
  "ED-17": {background: "#e9e9e8", regions: [
    {id: "anchor-material", x: 96, y: 101, width: 306, height: 90, start: 0, duration: 16, travelY: -14},
    {id: "anchor-angle", x: 760, y: 101, width: 306, height: 90, start: 16, duration: 16, travelY: -14},
    {id: "anchor-write", x: 1260, y: 101, width: 530, height: 90, start: 32, duration: 16, travelY: -14},
    {id: "sequence-flow", x: 26, y: 393, width: 1859, height: 478, start: 48, duration: 24, travelY: 20},
  ]},
  "ED-19": {background: "#131313", regions: [
    {id: "duty-orchestrate", x: 1227, y: 0, width: 693, height: 351, start: 0, duration: 22, travelX: 26},
    {id: "duty-outline", x: 1570, y: 322, width: 350, height: 613, start: 22, duration: 22, travelX: 26},
    {id: "duty-stylelib", x: 0, y: 564, width: 647, height: 387, start: 44, duration: 22, travelX: -26},
    {id: "duty-finalcheck", x: 0, y: 971, width: 1920, height: 109, start: 66, duration: 22, travelY: 16},
  ]},
};
if (!definitions[shotId]) throw new Error("local-review-shot-not-supported");
const current = readProjectWorkspace(appRoot);
const shot = current.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === shotId);
assertMotionReviewBinding(shot, shot.motionReviewPlan);
if (shot.motionReviewPlan.action !== "BUILD_LOCAL_CANARY") throw new Error("local-review-plan-required");
const auth = shot.singleShotMotionCanaryAuthorization;
if (!shot.prototypeEligible || auth?.scope !== "INTERNAL_REVIEW_CANARY_ONLY" || auth.sourceArtifactSha256 !== shot.artifactSha256 || auth.sourceVersionId !== shot.versionId || auth.sourceMotionDesignSha256 !== shot.motionDesignContract.motionDesignSha256) throw new Error("local-review-canary-authorization-required");
const source = motionReviewSource(shot);
const sourcePath = path.join(appRoot, "public", shot.artifactPublicUrl);
const sourceBytes = fs.readFileSync(sourcePath);
if (hash(sourceBytes) !== source.artifactSha256) throw new Error("local-review-static-sha-mismatch");
const rendererFiles = ["remotion-renderer/src/CurrentShotLocalMotionReviewV1.tsx", "remotion-renderer/src/current-shot-local-motion-review-index.tsx", "scripts/render-current-shot-local-motion-review-v1.mjs"];
const rendererSha256 = motionReviewHash(rendererFiles.map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
const timingIndex=process.argv.indexOf('--review-timing');
if(timingIndex>=0 && (!process.argv[timingIndex+1] || process.argv[timingIndex+1].startsWith('--')))throw Error('review-only-timing-file-required');
const timing=timingIndex>=0 ? JSON.parse(fs.readFileSync(path.resolve(root,process.argv[timingIndex+1]))) : null;
if(process.argv.includes('--validate-only') && !timing)throw Error('review-only-timing-file-required');
if(timing && (definitions[shotId].writingSurface || !definitions[shotId].regions.length))throw Error('review-only-timing-region-recipe-required');
const scoped=timing ? assertReviewOnlyMotionTiming(shot,timing,{root,regionIds:definitions[shotId].regions.map(r=>r.id)}) : null;
const fps=timing?.fps || 30;
const durationMs=timing?.durationMs || source.durationMs;
const definition = structuredClone(definitions[shotId]);
if(timing) {
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',scoped.audioPath],{encoding:'utf8'}));
  const audio=probe.streams.find(s=>s.codec_type==='audio');
  if(!audio || Math.abs(Number(audio.duration)*1000-durationMs)>.01)throw Error('review-only-timing-audio-duration-mismatch');
  for(const region of definition.regions){const beat=timing.beats.find(b=>b.id===region.id);region.start=beat.startMs*fps/1000;region.duration=beat.durationMs*fps/1000;}
}
if(shot.motionReviewPlan.viewerRequirements) {
  const endFrame=definition.writingSurface ? definition.writingSurface.pulseEndFrame : definition.vectorArtwork ? 47 : Math.max(...definition.regions.map(r=>r.start+r.duration));
  const viewing=auditShotViewingReadiness(shot.motionReviewPlan.viewerRequirements,{durationMs,demonstrationScope:"EDITORIAL_OR_PRESENTER",settledHoldMs:durationMs-endFrame/fps*1000,layoutStable:true});
  if(viewing.status!=="PASS")throw new Error(`viewing-preflight:${shotId}:${viewing.failures.join(":")}`);
}
if(process.argv.includes('--validate-only')){console.log(JSON.stringify({status:'REVIEW_ONLY_TIMING_VALID',durationMs,fps,frames:scoped.durationInFrames,sourceDurationMs:source.durationMs}));process.exit(0);}
const identity = motionReviewHash({source, rendererSha256, definition, ...(timing ? {timing} : {})});
const jobRoot = scoped ? scoped.outputDirectory : path.join(root, "work/motion-review-handoff-20260905", `${shotId}-${identity.slice(0, 12)}`);
const receiptPath = path.join(jobRoot, "receipt.json");
if (fs.existsSync(receiptPath)) {
  const cached = JSON.parse(fs.readFileSync(receiptPath));
  if(timing && cached.inputIdentity!==identity)throw Error("review-only-timing-output-exists-different-identity");
  if (hash(fs.readFileSync(path.join(root, cached.video.path))) !== cached.video.sha256) throw new Error("local-review-cache-corrupt");
  console.log(JSON.stringify({status: "CACHE_HIT", receiptPath}));
  process.exit(0);
}
if(scoped && fs.existsSync(jobRoot) && fs.readdirSync(jobRoot).length)throw Error('review-only-timing-output-not-empty');
fs.mkdirSync(path.join(jobRoot, "public"), {recursive: true});
fs.writeFileSync(path.join(jobRoot, "public/source.png"), sourceBytes);
const inputProps = {contract: "A1CurrentShotLocalMotionReview/v1", shotId, sourceImage: "source.png", durationInFrames: scoped?.durationInFrames ?? Math.round(source.durationMs / 1000 * 30), ...definition};
fs.writeFileSync(path.join(jobRoot, "props.json"), JSON.stringify(inputProps, null, 2));
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/current-shot-local-motion-review-index.tsx"), publicDir: path.join(jobRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  let composition = await selectComposition({serveUrl, id: "A1CurrentShotLocalMotionReviewV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  if(timing)composition={...composition,fps,durationInFrames:scoped.durationInFrames};
  const output = path.join(jobRoot, "review.mp4");
  if (!process.argv.includes("--stills-only")) await renderMedia({serveUrl, composition, inputProps, codec: "h264", outputLocation: output, scale: .5, crf: 16, concurrency: 2, puppeteerInstance: browser, logLevel: "warn"});
  const stills = definition.writingSurface ? [0,12,34,inputProps.durationInFrames-1] : definition.vectorArtwork ? [0,22,47,inputProps.durationInFrames-1] : [0, Math.floor(inputProps.durationInFrames / 2), inputProps.durationInFrames - 1];
  for (const frame of stills) await renderStill({serveUrl, composition, inputProps, output: path.join(jobRoot, `frame-${frame}.png`), frame, scale: .5, puppeteerInstance: browser, logLevel: "warn"});
  if (process.argv.includes("--stills-only")) {console.log(JSON.stringify({status:"KEYFRAMES_READY",jobRoot,stills})); await browser.close({silent:true}); process.exit(0);}
  const final = await sharp(path.join(jobRoot, `frame-${stills.at(-1)}.png`)).removeAlpha().raw().toBuffer();
  const reference = await sharp(sourceBytes).resize(960, 540).removeAlpha().raw().toBuffer();
  if (final.length !== reference.length) throw new Error("local-review-final-dimensions");
  const mae = final.reduce((sum, byte, i) => sum + Math.abs(byte - reference[i]), 0) / final.length;
  if (mae > 2.5) throw new Error(`local-review-final-parity:${mae}`);
  // Decode the entire video; probing metadata alone does not establish decodability.
  execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {stdio: "pipe"});
  const bytes = fs.readFileSync(output);
  const receipt = {contract: "A1ShotMotionReviewReceipt/v1", shotId, source, rendererFiles, rendererSha256, status: "READY_FOR_USER_REVIEW", usageMode: "INTERNAL_REVIEW_CANARY_ONLY", productionAdmission: false, userVisualApproval: "NOT_APPROVED", video: {path: path.relative(root, output), publicUrl: `/generated/system-line/editorial-asset-workbench-v1/shot-motion-review-v1/${identity}/${shotId}.mp4`, sha256: hash(bytes), bytes: bytes.length, width: 960, height: 540, fps: 30}, validation: {decoded: true, finalFrameMatchesSource: true, finalFrameMeanAbsoluteError: mae, threshold: 2.5, stillFrames: stills, resultHoldMs: (inputProps.durationInFrames - (definition.writingSurface ? definition.writingSurface.pulseEndFrame : definition.vectorArtwork ? 47 : Math.max(...definition.regions.map((r) => r.start + r.duration)))) / 30 * 1000}, createdAt: new Date().toISOString()};
  if(timing) {
    // Preserve approved samples exactly; MOV supports the source float PCM without AAC loss.
    assertReviewOnlyMotionTiming(shot,timing,{root,regionIds:definition.regions.map(r=>r.id)});
    const narrated=path.join(jobRoot,'review-narrated.mov');
    const temporary=path.join(jobRoot,'review-narrated.partial.mov');
    execFileSync('ffmpeg',['-v','error','-y','-i',output,'-i',scoped.audioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','pcm_f32le','-movflags','+faststart',temporary],{stdio:'pipe'});
    execFileSync('ffmpeg',['-v','error','-xerror','-i',temporary,'-f','null','-'],{stdio:'pipe'});
    const pcm=p=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:a:0','-c:a','pcm_f32le','-f','f32le','-'],{maxBuffer:64*1024*1024});
    const originalPcm=pcm(scoped.audioPath), candidatePcm=pcm(temporary);
    if(!originalPcm.equals(candidatePcm))throw Error('review-only-timing-pcm-mismatch');
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',temporary],{encoding:'utf8'}));
    const video=probe.streams.find(s=>s.codec_type==='video');
    if(Number(video.nb_read_frames)!==scoped.durationInFrames || Math.abs(Number(video.duration)*1000-durationMs)>.01)throw Error('review-only-timing-output-duration-mismatch');
    fs.renameSync(temporary,narrated);
    receipt.contract='A1ReviewOnlyMotionCandidate/v1';
    receipt.status='PENDING_INTERNAL_VIEWING_REVIEW';
    receipt.inputIdentity=identity;receipt.timing=timing;receipt.timingSha256=motionReviewHash(timing);
    receipt.video={path:path.relative(root,narrated),sha256:hash(fs.readFileSync(narrated)),bytes:fs.statSync(narrated).size,width:960,height:540,fps,durationMs,frames:scoped.durationInFrames};
    receipt.validation={...receipt.validation,resultHoldMs:(inputProps.durationInFrames-Math.max(...definition.regions.map(r=>r.start+r.duration)))/fps*1000,pcmIdentical:true,pcmSha256:hash(candidatePcm),pcmBytes:candidatePcm.length,sourceBytesVerified:true,officialTimingUnchanged:true,normalSpeedPlaybackReviewed:false};
    fs.writeFileSync(path.join(jobRoot,'timing-receipt.json'),JSON.stringify(timing,null,2)+'\n');
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({status: "PASS", shotId, receiptPath, video: receipt.video, validation: receipt.validation}, null, 2));
} finally { await browser.close({silent: true}); }
