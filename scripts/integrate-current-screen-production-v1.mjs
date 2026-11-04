#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditScreenSourceCandidate, compileIntegratedScreenScene, compileWaitOnlyRetime, screenIntegrationHash, screenShotBinding} from "../apps/studio-next/src/lib/a1-screen-source-integration-v1.mjs";
import {motionReviewSource, assertMotionReviewReceipt, auditShotViewingReadiness} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

import {refineScreenReviewDirection} from "../apps/studio-next/src/lib/a1-screen-review-direction-v1.mjs";
import {assertUnifiedScreenRender} from '../apps/studio-next/src/lib/a1-unified-screen-production-v1.mjs';

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const workRoot = path.join(root, "work/screen-production-integration-v1");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex");
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], {encoding: "utf8"}));
const workspace = readProjectWorkspace(appRoot);
const shots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.filter((s) => s.route === "SCREEN_EVIDENCE");
const mode = process.argv[2] || "plan";
fs.mkdirSync(workRoot, {recursive: true});
const planPath = path.join(workRoot, "plan.json");

if (mode === "candidate") {
  const [inputPath, expectedWorkspaceSha256, ...extra] = process.argv.slice(3);
  if (!inputPath || !/^[a-f0-9]{64}$/u.test(expectedWorkspaceSha256 || "") || extra.length) {
    throw new Error("usage: candidate input.json expectedWorkspaceSha256");
  }
  // Forward the caller's CAS unchanged. The shared locked transition owns all
  // source/media/approval checks; never refresh a stale CAS or write here.
  process.stdout.write(execFileSync(process.execPath, [
    path.join(root, "scripts/reconcile-shot-motion-review-v1.mjs"),
    "candidate", path.resolve(root, inputPath), expectedWorkspaceSha256,
  ], {cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024}));
} else if (mode === "baseline") {
  if(process.argv[3] && process.argv[3]!=="apply")throw new Error("usage: baseline [apply]");
  console.log(execFileSync(process.execPath,[path.join(root,"scripts/reconcile-unified-screen-production-v1.mjs"),...(process.argv[3]==="apply"?["--apply"]:[])],{encoding:"utf8"}));
} else if (mode === "reuse-timing") {
  const {adaptPackageTailTiming}=await import('./adapt-package-tail-timing-v1.mjs');
  await adaptPackageTailTiming({root,workspace,configPath:process.argv[3]});
} else if (mode === "reuse") {
  const {adaptExistingScreenPackages}=await import('./adapt-existing-screen-package-v1.mjs');
  await adaptExistingScreenPackages({root,workspace,shotIds:(process.argv[3]||'').split(',').filter(Boolean)});
} else if (mode === "entry-preview") {
  const {compileScreenEntryPreview} = await import("../apps/studio-next/src/lib/a1-screen-entry-preview-v1.mjs");
  const config = read(process.argv[3]), report = read(config.sourceReportPath), shot = shots.find(s => s.shotId === report.shotId);
  if (!shot || shaFile(report.output.path) !== report.output.sha256) throw new Error("entry-source-bytes-invalid");
  const fullProof = read(config.fullFlowProofReportPath);
  if (fullProof.sourceStoryboardVersionId !== shot.versionId || shaFile(fullProof.output.path) !== fullProof.output.sha256 || !fullProof.events.some(e => e.name === "rewrite_applied") || !fullProof.modelEvidence?.length) throw new Error("entry-canonical-full-flow-proof-unverified");
  const compiled = compileScreenEntryPreview(shot, report, config.direction);
  const compilerSha256 = shaFile("apps/studio-next/src/lib/a1-screen-entry-preview-v1.mjs");
  const identity = screenIntegrationHash({config, sourceReportSha256: shaFile(config.sourceReportPath), compilerSha256, binding: screenShotBinding(shot)});
  const dir = path.join(workRoot, `entry-${identity.slice(0,16)}`);fs.mkdirSync(dir,{recursive:true});
  const relative = name => path.relative(root,path.join(dir,name));
  const derived = {...report, status:"INTERNAL_SINGLE_SHOT_SEQUENCE_PROJECTION", sequenceBinding:{shotIds:[shot.shotId],versions:[shot.versionId],startMs:shot.timeRange.startMs,endMs:shot.timeRange.endMs}, originalCaptureReport:{path:config.sourceReportPath,sha256:shaFile(config.sourceReportPath)}};
  fs.writeFileSync(path.join(dir,"source-report.json"),JSON.stringify(derived,null,2));
  fs.writeFileSync(path.join(dir,"props.json"),JSON.stringify({contract:"A1ContinuousScreenEvidenceReel/v2",width:960,height:540,fps:60,audioUri:"",scenes:[compiled.scene],showReviewLabels:false,boundaryTransitionFrames:0,renderAudio:false}));
  fs.writeFileSync(path.join(dir,"direction-proof.json"),JSON.stringify({...compiled.proof,compilerSha256,fullFlowProof:{reportPath:config.fullFlowProofReportPath,reportSha256:shaFile(config.fullFlowProofReportPath),videoSha256:fullProof.output.sha256}},null,2));
  const renderConfig={sourceReportPath:relative("source-report.json"),directionPropsPath:relative("props.json"),directionProofPath:relative("direction-proof.json"),narrationPath:config.narrationPath,reviewTimes:[0,.25,.6,.75,.95,1.2,1.9]};
  fs.writeFileSync(path.join(dir,"render-config.json"),JSON.stringify(renderConfig,null,2));
  console.log(JSON.stringify({status:"ENTRY_PREVIEW_PREPARED",configPath:relative("render-config.json"),proof:compiled.proof}));
} else if (mode === "sequence") {
  const config=read(process.argv[3]),sourceReport=read(config.sourceReportPath);
  for(const id of sourceReport.sequenceBinding?.shotIds||[]){const shot=shots.find(s=>s.shotId===id);if(shot)assertUnifiedScreenRender(shot,config.productionBaselineSha256ByShot?.[id],sourceReport.output.sha256);}
  const {renderContinuousScreenIntegration} = await import("./render-continuous-screen-integration-v1.mjs");
  await renderContinuousScreenIntegration({root, workspace, configPath: process.argv[3], stillsOnly: process.argv[4] === "stills"});
} else if (mode === "plan") {
  const basePlan = read("work/remotion-screen-coverage-wave15-v1/plan.json");
  const cameraPlan = read("work/storyboard-attention-wave-plan-v1/camera-compiled-plan.json");
  const requirementsPath = path.join(workRoot, "source-requirements.json");
  const requirements = fs.existsSync(requirementsPath) ? read(requirementsPath) : {};
  const directionPath = path.join(workRoot, "review-directions.json");
  const directions = fs.existsSync(directionPath) ? read(directionPath) : {};
  const items = [];
  for (const shot of shots) {
    const base = basePlan.items.find((item) => item.shotId === shot.shotId);
    const direction = cameraPlan.items.find((item) => item.shotId === shot.shotId);
    const candidates = [];
    const requirement = requirements[shot.shotId] || {};
    const entryPreview = shot.motionReviewPlan?.viewerRequirements?.scope === "ENTRY_PREVIEW" && requirement.entryPreview;
    const reportPath = entryPreview ? requirement.entryPreview.reportPath : requirement.reportPath || direction?.source?.reportPath || base?.sourceReport;
    const sourceReport = reportPath ? read(reportPath) : null;
    const proofReport = entryPreview ? read(requirement.reportPath) : sourceReport;
    if (entryPreview && (proofReport.sourceStoryboardVersionId !== shot.versionId || shaFile(proofReport.output.path) !== proofReport.output.sha256)) throw new Error("entry-full-flow-proof-source-stale");
    const original = sourceReport?.output;
    const inspect = (id, file, kind, versionId, expectedSha) => {
      const full = path.resolve(root, file), exists = fs.existsSync(full);
      const media = exists ? probe(full) : null, stream = media?.streams.find((s) => s.codec_type === "video");
      const actualSha = exists ? shaFile(full) : null;
      const candidate = {id, path: file, kind, exists, versionId, sha256: actualSha, shaMatches: Boolean(expectedSha && actualSha === expectedSha), durationMs: media ? Math.round(Number(media.format.duration) * 1000) : null, width: stream?.width, height: stream?.height, fps: stream?.avg_frame_rate};
      return {...candidate, ...auditScreenSourceCandidate(shot, candidate)};
    };
    if (original?.path) {
      const candidate = inspect("codex-clean-capture", original.path, "CLEAN_CAPTURE", sourceReport.sourceStoryboardVersionId || sourceReport.storyboardBinding?.versionId, original.sha256);
      const missingEvents = (requirement.requiredResultEvents || []).filter((name) => !proofReport.events?.some((event) => event.name === name));
      if (missingEvents.length) {candidate.status = "REJECTED_FOR_CURRENT_RENDER";candidate.failures.push(...missingEvents.map((name) => `RESULT_ACTION_NOT_RECORDED:${name}`));}
      if (requirement.requireRealModel && !proofReport.modelEvidence?.some((item) => item.engine && item.requestedModel && !/local|heuristic|fallback|mock|rule/iu.test(item.engine) && item.variantCount > 0)) {
        candidate.status = "REJECTED_FOR_CURRENT_RENDER";candidate.failures.push("REAL_MODEL_RESPONSE_PROOF_REQUIRED");
      }
      candidates.push(candidate);
    }
    const hermesReportPath = `work/cap-native-${shot.shotId.toLowerCase().replace("-", "")}-engine-v1/report.json`;
    if (fs.existsSync(path.join(root, hermesReportPath))) {
      const report = read(hermesReportPath);
      if (report.sourceVideo?.path) candidates.push(inspect("hermes-clean-capture", report.sourceVideo.path, "CLEAN_CAPTURE", report.sourceStoryboardVersionId, report.sourceVideo.sha256));
    }
    const processed = `work/cap-native-production-v2/packaged-mainline-v3/${shot.shotId.toLowerCase()}-v3.mp4`;
    if (fs.existsSync(path.join(root, processed))) candidates.push(inspect("hermes-processed-v3", processed, "PACKAGED", null, null));
    const selected = candidates.find((c) => c.id === "codex-clean-capture" && c.status === "SOURCE_ELIGIBLE") || null;
    let compiled = null;
    if (selected && base) {
      selected.renderUri = `${shot.shotId}-${selected.sha256.slice(0, 12)}.mp4`;
      compiled = compileIntegratedScreenScene(shot, selected, sourceReport, read(base.propsPath).scenes[0]);
      if (entryPreview) {
        const {compileScreenEntryPreview} = await import("../apps/studio-next/src/lib/a1-screen-entry-preview-v1.mjs");
        const entry = compileScreenEntryPreview(shot, sourceReport, requirement.entryPreview.direction);
        const scene = {...entry.scene, sourceVideoUri: selected.renderUri};
        compiled = {scene, entryPreview: entry.proof, fullFlowProof: {reportPath: requirement.reportPath, reportSha256: shaFile(requirement.reportPath), sourceVideoSha256: proofReport.output.sha256}, program: {contract: entry.proof.contract, programSha256: screenIntegrationHash({scene, proof: entry.proof})}, decision: {effect: "NATIVE_SELECTION_TO_ENTRY_CONTROL", reason: "真实拖选后显示改写入口；只演示入口，完整改写回填证据单独保留。", resultHoldMs: entry.proof.settledHoldMs, production1080SourceReady: selected.width / entry.proof.finalCamera.scale >= 1920}};
      } else if (requirement.fixedDocumentFrame) {
        const stability=sourceReport.layoutStability;
        if(stability?.status!=="PASS" || !stability.samples?.length)throw new Error("fixed-document-layout-proof-required");
        for (const key of ["x","y","width","scrollY"]) {
          const values=stability.samples.map(sample=>sample[key]);
          if(values.some(value=>!Number.isFinite(value)) || Math.max(...values)-Math.min(...values)>2)throw new Error(`fixed-document-drift:${key}`);
        }
        if(stability.samples.some(sample=>sample.viewportWidth!==selected.width||sample.viewportHeight!==selected.height))throw new Error("fixed-document-coordinate-space-mismatch");
        const first=stability.samples[0],cropWidth=first.paperWidth+40;
        const scale=selected.width/cropWidth;
        if(cropWidth<1920)throw new Error("fixed-document-high-resolution-required");
        const bound=(value)=>Math.max(.5/scale,Math.min(1-.5/scale,value));
        const camera={x:bound((first.paperX+first.paperWidth/2)/selected.width),y:bound((first.y+Math.max(...stability.samples.map(s=>s.height))/2)/selected.height),scale};
        compiled.scene.screenDirection.samples=compiled.scene.screenDirection.samples.map(sample=>({...sample,camera:{...camera},actors:[]}));
        compiled.scene.screenDirection.attentionTrack=[];
        compiled.decision={...compiled.decision,effect:"LOCKED_DOCUMENT",maximumScale:scale,reason:"固定正文取景；侧栏不挤压正文，只看选中句与改写结果。",resultHoldMs:shot.timeRange.durationMs-(sourceReport.events.find(e=>e.name==="rewrite_applied")?.outputTimeMs||0)};
        compiled.layoutProof={status:"PASS",sourceReportSha256:shaFile(reportPath),drift:stability.drift,camera,cropWidth,modelOperationVerified:true};
      } else if (directions[shot.shotId]) compiled = refineScreenReviewDirection(compiled, shot, selected, sourceReport, directions[shot.shotId]);
    }
    items.push({shotId: shot.shotId, binding: screenShotBinding(shot), reviewSource: motionReviewSource(shot), reportPath, reportSha256: reportPath ? shaFile(reportPath) : null, candidates, selected, status: compiled ? "READY_FOR_INTERNAL_REVIEW_RENDER" : "SOURCE_RECAPTURE_REQUIRED", blockers: compiled ? [] : ["NO_VERIFIED_CURRENT_CLEAN_SOURCE"], ...compiled});
  }
  const body = {contract: "A1CurrentScreenProductionIntegration/v1", sourceStoryboardSha256: screenIntegrationHash(shots.map(screenShotBinding)), sourceWorkspaceSha256: workspace.workspaceSha256, timeline: workspace.visualBible.timeline, items, summary: {total: items.length, eligible: items.filter((i) => i.selected).length, blocked: items.filter((i) => !i.selected).map((i) => i.shotId)}, boundary: {productionAdmission: false, resolveImportAllowed: false, generatedVoiceUsed: false}};
  const plan = {...body, planSha256: screenIntegrationHash(body)};
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
  console.log(JSON.stringify({status: "PLAN_READY", planPath, ...plan.summary, planSha256: plan.planSha256}, null, 2));
} else if (mode === "reserve-result-hold") {
  const [reportPath, startEvent, endEvent, reserve] = process.argv.slice(3);
  const original=read(reportPath),shot=shots.find(s=>s.shotId===original.shotId);
  if(!shot||original.sourceStoryboardVersionId!==shot.versionId)throw new Error("result-hold-source-version-mismatch");
  const input=path.resolve(root,original.output.path);
  if(shaFile(input)!==original.output.sha256)throw new Error("result-hold-source-sha-mismatch");
  const timing=compileWaitOnlyRetime({waitStartMs:original.events.find(e=>e.name===startEvent)?.outputTimeMs,waitEndMs:original.events.find(e=>e.name===endEvent)?.outputTimeMs,sourceDurationMs:original.output.durationMs,targetDurationMs:shot.timeRange.durationMs,reserveHoldMs:Number(reserve)});
  const identity=screenIntegrationHash({source:original.output.sha256,timing});
  const dir=path.join(workRoot,`result-hold-${shot.shotId}-${identity.slice(0,12)}`);fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,"source.mp4");
  const filter=timing.segments.map((s,i)=>`[0:v]trim=start=${s.sourceStartMs/1000}:end=${s.sourceEndMs/1000},setpts=(PTS-STARTPTS)*${s.outputDurationMs/(s.sourceEndMs-s.sourceStartMs)}[v${i}]`).join(";")+`;[v0][v1][v2]concat=n=3:v=1:a=0,fps=60,tpad=stop_mode=clone:stop_duration=${timing.padHoldMs/1000+.1}[v]`;
  if(!fs.existsSync(output))execFileSync("ffmpeg",["-v","error","-i",input,"-filter_complex",filter,"-map","[v]","-t",String(shot.timeRange.durationMs/1000),"-an","-c:v","libx264","-preset","fast","-crf","17",output]);
  execFileSync("ffmpeg",["-v","error","-i",output,"-f","null","-"],{stdio:"pipe"});
  const mapTime=(ms)=>{let sum=0;for(const s of timing.segments){if(ms<=s.sourceEndMs)return sum+Math.max(0,ms-s.sourceStartMs)*s.outputDurationMs/(s.sourceEndMs-s.sourceStartMs);sum+=s.outputDurationMs;}return sum;};
  const media=probe(output),stream=media.streams.find(s=>s.codec_type==="video");
  const report={...original,status:"INTERNAL_TIMING_CANDIDATE_NOT_ADMITTED",events:original.events.map(e=>({...e,outputTimeMs:mapTime(e.outputTimeMs)})),normalization:{sourceReportPath:reportPath,sourceReportSha256:shaFile(reportPath),...timing},output:{path:path.relative(root,output),sha256:shaFile(output),width:stream.width,height:stream.height,fps:stream.avg_frame_rate,durationMs:Math.round(Number(media.format.duration)*1000),fullDecodePass:true},evidence:null};
  // Input-space geometry/telemetry remains in the source report; do not present it as retimed evidence.
  for(const key of ["pointerTargets","domTargets","textRangeEvidence","persistentResultDom","cursorTelemetry","caretTelemetry","layoutStability"])delete report[key];
  fs.writeFileSync(path.join(dir,"report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({status:report.status,reportPath:path.relative(root,path.join(dir,"report.json")),timing}));
} else if (mode === "rebalance-reading") {
  const original=read(process.argv[3]);
  const shot=shots.find(s=>s.shotId===original.shotId);
  if(!shot||original.sourceStoryboardVersionId!==shot.versionId)throw new Error("reading-source-version-mismatch");
  const event=(name)=>original.events.find(e=>e.name===name)?.outputTimeMs;
  const waitStart=event("paragraph_request_run"),candidateAt=event("paragraph_candidates_hold")+50;
  const revealAt=2500, pauseMs=candidateAt-revealAt;
  if(!(waitStart<revealAt&&pauseMs>0&&event("paragraph_candidate_applied")-candidateAt>=800))throw new Error("reading-rebalance-invalid");
  const input=path.resolve(root,original.output.path);
  if(shaFile(input)!==original.output.sha256)throw new Error("reading-source-sha-mismatch");
  const recipe={version:2,waitStart,candidateAt,revealAt,pauseMs,actionPlaybackRate:1,freezeSourceMs:candidateAt};
  const identity=screenIntegrationHash({source:original.output.sha256,recipe});
  const dir=path.join(workRoot,`reading-${shot.shotId}-${identity.slice(0,12)}`);fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,"source.mp4");
  // Spend saved model-wait time on an actual returned candidate, before the real click.
  const filter=`[0:v]split=4[a][b][c][d];[a]trim=0:${waitStart/1000},setpts=PTS-STARTPTS[v0];[b]trim=${waitStart/1000}:${candidateAt/1000},setpts=(PTS-STARTPTS)*${(revealAt-waitStart)/(candidateAt-waitStart)}[v1];[c]trim=${candidateAt/1000}:${candidateAt/1000+0.02},setpts=PTS-STARTPTS,loop=loop=-1:size=1:start=0,setpts=N/(60*TB),trim=duration=${pauseMs/1000}[v2];[d]trim=${candidateAt/1000},setpts=PTS-STARTPTS[v3];[v0][v1][v2][v3]concat=n=4:v=1:a=0,fps=60,tpad=stop_mode=clone:stop_duration=0.1[v]`;
  if(!fs.existsSync(output))execFileSync("ffmpeg",["-v","error","-i",input,"-filter_complex",filter,"-map","[v]","-t",String(shot.timeRange.durationMs/1000),"-an","-c:v","libx264","-preset","fast","-crf","17","-pix_fmt","yuv420p","-movflags","+faststart",output]);
  const media=probe(output),stream=media.streams.find(s=>s.codec_type==="video");
  if(Math.abs(Number(media.format.duration)*1000-shot.timeRange.durationMs)>80)throw new Error("reading-output-duration-mismatch");
  const report={...original,events:original.events.map(e=>e.name==="paragraph_candidates_hold"?{...e,outputTimeMs:revealAt}:e),normalization:{contract:"A1EditorialReadingRebalance/v1",sourcePath:original.output.path,sourceSha256:original.output.sha256,recipe,onlyModelWaitCompressed:true,readingHoldAdded:true},output:{path:path.relative(root,output),sha256:shaFile(output),width:stream.width,height:stream.height,fps:stream.avg_frame_rate,durationMs:Math.round(Number(media.format.duration)*1000)},evidence:null};
  fs.writeFileSync(path.join(dir,"report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({status:"PASS",reportPath:path.relative(root,path.join(dir,"report.json")),recipe}));
} else if (mode === "retime") {
  const [reportPath, rawPath, waitStartEvent, waitEndEvent] = process.argv.slice(3);
  const original = read(reportPath), shot = shots.find((s) => s.shotId === original.shotId);
  if (!shot || original.sourceStoryboardVersionId !== shot.versionId) throw new Error("retime-source-version-mismatch");
  const raw = path.resolve(root, rawPath), rawMedia = probe(raw), rawDurationMs = Number(rawMedia.format.duration) * 1000;
  const events = original.events;
  const sourceDurationMs = events.at(-1).tMs;
  const timing = compileWaitOnlyRetime({waitStartMs: events.find((e) => e.name === waitStartEvent)?.tMs, waitEndMs: events.find((e) => e.name === waitEndEvent)?.tMs, sourceDurationMs, targetDurationMs: shot.timeRange.durationMs});
  const rawSha256 = shaFile(raw), identity = screenIntegrationHash({rawSha256, timing});
  const dir = path.join(workRoot, `retimed-${shot.shotId}-${identity.slice(0, 12)}`);fs.mkdirSync(dir, {recursive: true});
  const output = path.join(dir, "source.mp4"), offset = Math.max(0, rawDurationMs - sourceDurationMs) / 1000;
  const filter = timing.segments.map((s, i) => `[0:v]trim=start=${offset+s.sourceStartMs/1000}:end=${offset+s.sourceEndMs/1000},setpts=(PTS-STARTPTS)*${s.outputDurationMs/(s.sourceEndMs-s.sourceStartMs)}[v${i}]`).join(";") + `;[v0][v1][v2]concat=n=3:v=1:a=0,fps=60,tpad=stop_mode=clone:stop_duration=${Math.max(.5,timing.padHoldMs/1000)}[v]`;
  if (!fs.existsSync(output)) execFileSync("ffmpeg", ["-v", "error", "-i", raw, "-filter_complex", filter, "-map", "[v]", "-t", String(shot.timeRange.durationMs/1000), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  const metadata = probe(output), stream = metadata.streams.find((s) => s.codec_type === "video");
  const mapTime = (ms) => {let sum=0;for(const s of timing.segments){if(ms<=s.sourceEndMs)return Math.round(sum+Math.max(0,ms-s.sourceStartMs)*s.outputDurationMs/(s.sourceEndMs-s.sourceStartMs));sum+=s.outputDurationMs;}return Math.round(sum);};
  const report = {...original, normalization: {rawPath, rawSha256, sourceReportPath: reportPath, sourceReportSha256: shaFile(reportPath), ...timing}, events: events.map((e) => ({...e, outputTimeMs: mapTime(e.tMs)})), output: {path: path.relative(root,output), sha256: shaFile(output), width: stream.width, height: stream.height, fps: stream.avg_frame_rate, durationMs: Math.round(Number(metadata.format.duration)*1000)}, evidence: null};
  fs.writeFileSync(path.join(dir,"report.json"), JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({status:"PASS",reportPath:path.relative(root,path.join(dir,"report.json")),actionPlaybackRate:1}));
} else if (mode === "render") {
  const plan = read(planPath);
  if (screenIntegrationHash(shots.map(screenShotBinding)) !== plan.sourceStoryboardSha256) throw new Error("screen-integration-storyboard-stale");
  const ids = new Set((process.argv[3] || "").split(",").filter(Boolean));
  if (!ids.size) throw new Error("explicit-shot-list-required");
  const items = plan.items.filter((i) => ids.has(i.shotId));
  if (items.length !== ids.size) throw new Error("screen-integration-shot-not-found");
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const rendererFiles = ["remotion-renderer/src/ContinuousScreenEvidenceReelV2.tsx", "remotion-renderer/src/current-screen-integration-entry.tsx", "apps/studio-next/src/lib/a1-screen-source-integration-v1.mjs"];
  const baseRendererFiles = rendererFiles;
  const publicDir = path.join(workRoot, "staging-public");fs.mkdirSync(publicDir, {recursive: true});
  for (const item of items) {
    if (!item.selected) throw new Error(`screen-source-blocked:${item.shotId}`);
    const shot = shots.find((s) => s.shotId === item.shotId), auth = shot.singleShotMotionCanaryAuthorization;
    assertUnifiedScreenRender(shot,item.productionBaselineSha256,item.selected.sha256);
    if(shot.motionReviewPlan?.viewerRequirements) {
      const report=read(item.reportPath);
      const viewing=auditShotViewingReadiness(shot.motionReviewPlan.viewerRequirements,{durationMs:shot.timeRange.durationMs,demonstrationScope:report.demonstrationScope||"FULL_FLOW",settledHoldMs:item.decision.resultHoldMs,layoutStable:report.layoutStability?.status==="PASS"});
      if(viewing.status!=="PASS")throw new Error(`viewing-preflight:${item.shotId}:${viewing.failures.join(":")}`);
    }
    if (!shot.prototypeEligible || auth?.sourceVersionId !== shot.versionId || auth.sourceArtifactSha256 !== shot.artifactSha256 || auth.sourceMotionDesignSha256 !== shot.motionDesignContract?.motionDesignSha256) throw new Error(`screen-canary-authorization-required:${item.shotId}`);
    if (shaFile(item.selected.path) !== item.selected.sha256 || shaFile(item.reportPath) !== item.reportSha256) throw new Error(`screen-source-changed:${item.shotId}`);
    const dest = path.join(publicDir, item.selected.renderUri);if (!fs.existsSync(dest)) fs.copyFileSync(path.resolve(root, item.selected.path), dest);
  }
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/current-screen-integration-entry.tsx"), publicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    for (const item of items) {
      const rendererFiles = item.entryPreview ? [...baseRendererFiles, "apps/studio-next/src/lib/a1-screen-entry-preview-v1.mjs"] : item.director ? [...baseRendererFiles, "apps/studio-next/src/lib/a1-screen-review-direction-v1.mjs"] : baseRendererFiles;
      const rendererSha256 = screenIntegrationHash(rendererFiles.map((file) => [file, shaFile(file)]));
      const inputProps = {contract: "A1ContinuousScreenEvidenceReel/v2", width: 960, height: 540, fps: 60, audioUri: "", scenes: [item.scene], showReviewLabels: false, boundaryTransitionFrames: 0, renderAudio: false};
      const identity = screenIntegrationHash({binding: item.binding, program: item.program.programSha256, rendererSha256, scene: item.scene});
      const dir = path.join(workRoot, `${item.shotId}-${identity.slice(0, 12)}`);fs.mkdirSync(dir, {recursive: true});
      const receiptPath = path.join(dir, "receipt.json");
      if (fs.existsSync(receiptPath)) {const cached = read(receiptPath);if (shaFile(cached.video.path) !== cached.video.sha256) throw new Error("screen-review-cache-corrupt");console.log(JSON.stringify({status: "CACHE_HIT", shotId: item.shotId, receiptPath}));continue;}
      const composition = await selectComposition({serveUrl, id: "A1CurrentScreenIntegrationReview", inputProps, puppeteerInstance: browser, logLevel: "warn"});
      const output = path.join(dir, "review.mp4");
      await renderMedia({serveUrl, composition, inputProps, codec: "h264", outputLocation: output, crf: 17, concurrency: 2, muted: true, enforceAudioTrack: false, puppeteerInstance: browser, logLevel: "warn"});
      for (const frame of [0, Math.floor(composition.durationInFrames / 2), composition.durationInFrames - 1]) await renderStill({serveUrl, composition, inputProps, output: path.join(dir, `frame-${frame}.png`), frame, puppeteerInstance: browser, logLevel: "warn"});
      execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {stdio: "pipe"});
      const media = probe(output), stream = media.streams.find((s) => s.codec_type === "video");
      if (stream.width !== 960 || stream.height !== 540 || media.streams.some((s) => s.codec_type === "audio") || Math.abs(Number(media.format.duration) * 1000 - item.binding.timeRange.durationMs) > 80) throw new Error("screen-review-media-contract-failed");
      const receipt = {contract: "A1ShotMotionReviewReceipt/v1", kind: "SCREEN_EVIDENCE", shotId: item.shotId, source: item.reviewSource, rendererFiles, rendererSha256, status: "READY_FOR_USER_REVIEW", usageMode: "INTERNAL_REVIEW_CANARY_ONLY", productionAdmission: false, userVisualApproval: "NOT_APPROVED", capturedSource: item.selected, programSha256: item.program.programSha256, video: {path: path.relative(root, output), publicUrl: `/generated/system-line/editorial-asset-workbench-v1/shot-motion-review-v1/${identity}/${item.shotId}.mp4`, sha256: shaFile(output), width: 960, height: 540, fps: 60, durationMs: Math.round(Number(media.format.duration) * 1000)}, validation: {decoded: true, sourceBytesVerified: true, currentStoryboardTiming: true, noGeneratedVoice: true}, createdAt: new Date().toISOString()};
      fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
      fs.writeFileSync(path.join(dir, "props.json"), JSON.stringify(inputProps) + "\n");
      console.log(JSON.stringify({status: "PASS", shotId: item.shotId, effect: item.decision.effect, receiptPath}));
    }
  } finally {await browser.close({silent: true});}
} else if (mode === "manifest") {
  const plan = read(planPath);
  if (screenIntegrationHash(shots.map(screenShotBinding)) !== plan.sourceStoryboardSha256) throw new Error("screen-integration-storyboard-stale");
  const rendererFiles = ["remotion-renderer/src/ContinuousScreenEvidenceReelV2.tsx", "remotion-renderer/src/current-screen-integration-entry.tsx", "apps/studio-next/src/lib/a1-screen-source-integration-v1.mjs"];
  const baseRendererFiles = rendererFiles;
  const items = plan.items.map((item) => {
    const rendererFiles = item.entryPreview ? [...baseRendererFiles, "apps/studio-next/src/lib/a1-screen-entry-preview-v1.mjs"] : item.director ? [...baseRendererFiles, "apps/studio-next/src/lib/a1-screen-review-direction-v1.mjs"] : baseRendererFiles;
    const rendererSha256 = screenIntegrationHash(rendererFiles.map((file) => [file, shaFile(file)]));
    if (!item.selected) return {shotId: item.shotId, ...item.binding.timeRange, status: "SOURCE_RECAPTURE_REQUIRED", receiptPath: null, videoPath: null};
    const identity = screenIntegrationHash({binding: item.binding, program: item.program.programSha256, rendererSha256, scene: item.scene});
    const receiptPath = path.join(workRoot, `${item.shotId}-${identity.slice(0, 12)}`, "receipt.json");
    const receipt = fs.existsSync(receiptPath) ? read(receiptPath) : null;
    if (receipt && shaFile(receipt.video.path) !== receipt.video.sha256) throw new Error("screen-manifest-video-sha-mismatch");
    return {shotId: item.shotId, ...item.binding.timeRange, status: receipt ? "READY_FOR_USER_REVIEW" : "RENDER_REQUIRED", sourcePath: item.selected.path, sourceSha256: item.selected.sha256, sourceWidth: item.selected.width, production1080SourceReady: item.decision.production1080SourceReady, effect: item.decision.effect, receiptPath: receipt ? path.relative(root, receiptPath) : null, videoPath: receipt ? path.resolve(root, receipt.video.path) : null, videoSha256: receipt?.video.sha256 || null};
  });
  const manifest = {contract: "A1ScreenReviewInsertionManifest/v1", status: items.every((i) => i.status === "READY_FOR_USER_REVIEW") ? "READY_FOR_USER_REVIEW" : "PARTIAL_REVIEW_SOURCE_BLOCKED", sourceStoryboardSha256: plan.sourceStoryboardSha256, originalNarrationTimeline: plan.timeline, items, reviewReadyCount: items.filter((i) => i.status === "READY_FOR_USER_REVIEW").length, blockedShotIds: items.filter((i) => i.status !== "READY_FOR_USER_REVIEW").map((i) => i.shotId), needsHigherResolutionShotIds: items.filter((i) => i.videoPath && !i.production1080SourceReady).map((i) => i.shotId), boundary: {reviewOnly: true, originalNarrationUntouched: true, synthesizedNarrationAdded: false, newRenderPlaybackRate: 1, currentBoardReplaced: false, productionAdmission: false, resolveImportAllowed: false}};
  fs.writeFileSync(path.join(workRoot, "review-insertion-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const columns = ["shotId", "startMs", "endMs", "durationMs", "status", "videoPath", "videoSha256", "production1080SourceReady"];
  const csv = [columns.join(","), ...items.map((item) => columns.map((key) => `"${String(item[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n") + "\n";
  fs.writeFileSync(path.join(workRoot, "resolve-review-insertion.csv"), csv);
  console.log(JSON.stringify({status: manifest.status, reviewReadyCount: manifest.reviewReadyCount, blockedShotIds: manifest.blockedShotIds, needsHigherResolutionShotIds: manifest.needsHigherResolutionShotIds}));
} else if (mode === "apply" || mode === "admit") {
  const plan = read(planPath);
  if (screenIntegrationHash(shots.map(screenShotBinding)) !== plan.sourceStoryboardSha256) throw new Error("screen-integration-storyboard-stale");
  const invoke = (action, file) => {
    const current = readProjectWorkspace(appRoot);
    return JSON.parse(execFileSync(process.execPath, [path.join(root, "scripts/reconcile-shot-motion-review-v1.mjs"), action, file, current.workspaceSha256], {encoding: "utf8"}));
  };
  if (mode === "apply") {
    const directivePath = process.argv[3];
    if (!directivePath) throw new Error("explicit-user-directive-file-required");
    const userDirective = read(directivePath);
    if (!userDirective.quote || !userDirective.scope) throw new Error("user-directive-quote-and-scope-required");
    const selectedIds = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
    const selectedItems = selectedIds ? plan.items.filter(item=>selectedIds.has(item.shotId)) : plan.items;
    if (selectedIds && selectedItems.length !== selectedIds.size) throw new Error("screen-apply-shot-not-found");
    const reviewPlan = {contract: "A1ShotMotionReviewPlanSet/v1", userDirective, shots: selectedItems.map((item) => ({shotId: item.shotId, source: item.reviewSource, action: item.selected ? "BUILD_SCREEN_CANARY" : "SOURCE_RECAPTURE_REQUIRED", reason: item.selected ? item.decision.reason : "缺少能证明当前分镜完整操作的真实源片，需先补齐来源。", capturedSource: item.selected, ...(item.fullFlowProof ? {fullFlowProof:item.fullFlowProof} : {}), programSha256: item.program?.programSha256 || null, generationAllowed: false, productionAdmission: false}))};
    const file = path.join(workRoot, "review-plan.json");fs.writeFileSync(file, JSON.stringify(reviewPlan, null, 2) + "\n");
    console.log(JSON.stringify(invoke("plan", file)));
  } else {
    const manifest = read(path.join(workRoot, "review-insertion-manifest.json"));
    if (manifest.sourceStoryboardSha256 !== plan.sourceStoryboardSha256) throw new Error("screen-manifest-stale");
    for (const item of manifest.items.filter((item) => item.receiptPath)) {
      const receipt=read(item.receiptPath),current=readProjectWorkspace(appRoot),shot=current.production.shotIntelligence.currentStoryboardAuthority.shots.find((s)=>s.shotId===item.shotId);
      assertMotionReviewReceipt(shot,receipt);
      if(JSON.stringify(shot.motionReviewReceipt)===JSON.stringify(receipt)){console.log(JSON.stringify({shotId:item.shotId,status:"CURRENT_RECEIPT_REUSED"}));continue;}
      console.log(JSON.stringify({shotId:item.shotId,...invoke("record",path.resolve(root,item.receiptPath))}));
    }
  }
} else throw new Error("usage: plan | sequence config.json | apply directive.json | render shot-ids | rebalance-reading report | retime report raw wait-start wait-end | manifest | admit");
