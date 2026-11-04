#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {assertBoundScreenReviewDuration} from './lib/bound-screen-review-duration-v1.mjs';

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPhysicalMotionContract} from "../apps/studio-next/src/lib/a1-physical-motion-contract-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertReviewPlaybackSelection, assertMotionReviewBinding, assertMotionReviewReceipt, assertMotionReviewReplacement, assertScreenRepairCandidate, motionReviewHash, motionReviewSource, auditShotViewingReadiness, mergeMotionReviewPlan} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

import {deriveStoryboardMotionDesignContract} from "../apps/studio-next/src/lib/a1-storyboard-motion-design-contract-v1.mjs";
import {assertUnifiedScreenSelection,unifiedSelectionHash,completeUnifiedScreenSelection} from '../apps/studio-next/src/lib/a1-unified-screen-production-v1.mjs';

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const [mode, inputPath, expected] = process.argv.slice(2);
if (!["plan", "record", "adopt-design", "candidate", "select-review"].includes(mode) || !/^[a-f0-9]{64}$/u.test(expected || "")) throw new Error("usage: plan|record|candidate|select-review input.json expectedWorkspaceSha256");
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const boundary = (w) => ({gates: w.gates, nextAction: w.production.authority.nextAction, approval: w.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval, motionAllowed: w.production.shotIntelligence.currentStoryboardAuthority.motionAllowed});

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected) throw new Error(`motion-review-cas:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const authority = next.production.shotIntelligence.currentStoryboardAuthority;
  const files = {}, binaryFiles = {};
  const records = mode === "plan" ? input.shots : [input];
  if (!Array.isArray(records) || !records.length || new Set(records.map((r) => r.shotId)).size !== records.length) throw new Error("motion-review-records-invalid");
  let changed = false;
  for (const record of records) {
    const shot = authority.shots.find((s) => s.shotId === record.shotId && s.current !== false);
    if (!shot) throw new Error(`motion-review-shot-missing:${record.shotId}`);
    assertMotionReviewBinding(shot, record);
    const staticPath = path.join(appRoot, "public", shot.artifactPublicUrl);
    if (sha(fs.readFileSync(staticPath)) !== shot.artifactSha256) throw new Error(`motion-review-static-sha:${shot.shotId}`);
    if (mode === "select-review" && record.kind === 'APPROVED_REFERENCE') {
      const {assertApprovedReferenceSelection}=await import('../apps/studio-next/src/lib/a1-packaging-reference-media-v1.mjs');
      const media=assertApprovedReferenceSelection(next,record,root);
      shot.reviewPlaybackSelectionHistory=[...(shot.reviewPlaybackSelectionHistory||[]),{selection:shot.reviewPlaybackSelection||null,at:new Date().toISOString()}];
      shot.reviewPlaybackSelection={...record,video:media.video,selectedAt:new Date().toISOString()};
      changed=true;
    } else if (mode === "select-review") {
      const candidate = assertReviewPlaybackSelection(shot, record);
      if(candidate.reviewOnlyDuration) {
        const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-of','json',path.resolve(root,candidate.video.path)],{encoding:'utf8'}));
        assertBoundScreenReviewDuration(shot,candidate,Number(probe.format.duration)*1000,{root});
      }
      for (const entry of [candidate.video,candidate.captureReport,candidate.capExport || candidate.renderedVideo,candidate.narrationSource]) {
        const file=fs.realpathSync(path.resolve(root,entry.path));
        if (!file.startsWith(fs.realpathSync(path.join(root,'work'))+path.sep) || sha(fs.readFileSync(file))!==entry.sha256) throw Error('review-selection-source-bytes-changed');
      }
      const report=JSON.parse(fs.readFileSync(path.resolve(root,candidate.captureReport.path),'utf8'));
      assertScreenRepairCandidate(shot,candidate,report);
      const raw=fs.realpathSync(path.resolve(root,report.sourceVideo.path));
      if (!raw.startsWith(fs.realpathSync(path.join(root,'work'))+path.sep) || sha(fs.readFileSync(raw))!==report.sourceVideo.sha256) throw Error('review-selection-capture-bytes-changed');
      const served=path.resolve(appRoot,'public',candidate.video.publicUrl.replace(/^\//,''));
      if (!served.startsWith(path.join(appRoot,'public/generated/system-line/editorial-asset-workbench-v1/shot-motion-review-v1/') ) || sha(fs.readFileSync(served))!==candidate.video.sha256) throw Error('review-selection-public-bytes-changed');
      shot.reviewPlaybackSelectionHistory=[...(shot.reviewPlaybackSelectionHistory||[]),{selection:shot.reviewPlaybackSelection||null,receipt:shot.motionReviewReceipt,at:new Date().toISOString()}];
      shot.reviewPlaybackSelection={...record,video:structuredClone(candidate.video),candidate:structuredClone(candidate),selectedAt:new Date().toISOString()};
      changed=true;
    } else if (mode === "candidate") {
      const loadBound = (entry) => {
        if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw Error('candidate-file-sha-required');
        const file = fs.realpathSync(path.resolve(root, entry.path));
        if (!file.startsWith(fs.realpathSync(path.join(root, 'work')) + path.sep)) throw Error('candidate-file-outside-work');
        const bytes = fs.readFileSync(file);
        if (sha(bytes) !== entry.sha256) throw Error('candidate-file-sha-mismatch');
        return {file, bytes};
      };
      const reportFile = loadBound(record.captureReport);
      const report = JSON.parse(reportFile.bytes);
      assertScreenRepairCandidate(shot, record, report);
      if (unifiedSelectionHash(shot.motionReviewPlan?.productionBaseline) !== record.productionBaselineSha256) throw Error('candidate-baseline-stale');
      loadBound(report.sourceVideo);
      const continuousRepair = record.kind === 'CONTINUOUS_VERIFIED_SOURCE_REPAIR';
      const media = loadBound(record.video), upstream = loadBound(continuousRepair ? record.renderedVideo : record.capExport), audio = loadBound(record.narrationSource);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',media.file],{encoding:'utf8'}));
      const video = probe.streams.find(s=>s.codec_type==='video');
      if (video?.width !== (continuousRepair ? 960 : 1920) || video?.height !== (continuousRepair ? 540 : 1050) || video?.avg_frame_rate !== '60/1' || Math.abs(Number(probe.format.duration)*1000-assertBoundScreenReviewDuration(shot,record,Number(probe.format.duration)*1000,{root}))>80 || !probe.streams.some(s=>s.codec_type==='audio')) throw Error('candidate-media-contract-invalid');
      const continuousValidation = continuousRepair ? (await import('./lib/validate-continuous-screen-repair-media-v1.mjs')).validateContinuousRepairMedia({root,shot,record,loadBound,sha,video,media}) : null;
      execFileSync('ffmpeg',['-v','error','-i',media.file,'-f','null','-'],{stdio:'pipe'});
      const packets = (file, stream) => JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams',stream,'-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',file],{encoding:'utf8',maxBuffer:16*1024*1024})).packets.map(p=>p.data_hash);
      const vp=packets(media.file,'v:0'), ap=packets(media.file,'a:0');
      if (!vp.length || JSON.stringify(vp)!==JSON.stringify(packets(upstream.file,'v:0'))) throw Error(continuousRepair ? 'candidate-rendered-video-packets-mismatch' : 'candidate-export-video-packets-mismatch');
      if (!ap.length || JSON.stringify(ap)!==JSON.stringify(packets(audio.file,'a:0'))) throw Error('candidate-original-audio-packets-mismatch');
      const purity = JSON.parse(execFileSync('python3', ['-c', `import importlib.util,json,subprocess,tempfile,sys,os
spec=importlib.util.spec_from_file_location('purity',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
rows=[]
with tempfile.TemporaryDirectory() as d:
 for i in range(9):
  t=(float(sys.argv[3])-.1)*i/8;p=os.path.join(d,str(i)+'.png')
  subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',sys.argv[2],'-frames:v','1',p],check=True)
  rows.append({'time':t,**m.check_image(p)})
print(json.dumps({'pure':all(m.verdict(x) for x in rows),'samples':rows}))`,path.join(root,'scripts/a1-cap-purity-gate.py'),media.file,probe.format.duration], {encoding:'utf8'}));
      if (!purity.pure) throw Error('candidate-purity-failed');
      const relative = `shot-motion-review-v1/repair-candidates/${record.video.sha256}/${shot.shotId}.mp4`;
      const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${relative}`;
      const candidate = {...record,video:{...record.video,publicUrl},validation:{decoded:true,...(continuousRepair ? {videoPacketsMatchContinuousRender:true,continuousRepair:continuousValidation} : {videoPacketsMatchCapExport:true}),audioPacketsMatchExistingNarration:true,purity},status:'PENDING_REPAIRED_SCREEN_REVIEW'};
      shot.motionReviewPlan.viewerReview = {status:'PENDING_REPAIRED_SCREEN_REVIEW',candidateVideoSha256:record.video.sha256,candidateVideoPublicUrl:publicUrl,previousReview:shot.motionReviewPlan.viewerReview,repairCandidate:candidate};
      binaryFiles[relative] = media.bytes;
      changed = true;
    } else if (mode === "adopt-design") {
      const candidate=shot.motionReviewPlan?.designCandidate;
      if(record.approval!=="APPROVED" || !record.userDirective?.quote || !candidate || candidate.sha256!==record.candidateSha256)throw new Error("design-adoption-explicit-bound-approval-required");
      const bytes=fs.readFileSync(path.resolve(root,candidate.path));
      if(sha(bytes)!==candidate.sha256)throw new Error("design-adoption-candidate-bytes-changed");
      const meta=await sharp(bytes).metadata();if(meta.width!==1920||meta.height!==1080)throw new Error("design-adoption-canvas-invalid");
      if (!candidate.semanticJob || ["before","hold","after","handoff"].some((key)=>!String(candidate.actionContract?.[key]||"").trim())) throw new Error("design-adoption-semantic-action-contract-required");
      assertPhysicalMotionContract(candidate.physicalMotionContract,{shotId:shot.shotId});
      const relative=candidate.publicUrl.replace("/generated/system-line/editorial-asset-workbench-v1/","");
      if(!relative.startsWith("shot-motion-review-v1/")||relative.includes(".."))throw new Error("design-adoption-path-invalid");
      binaryFiles[relative]=bytes;
      const versionId=`${shot.shotId.toLowerCase()}-approved-design-${candidate.sha256.slice(0,12)}`;
      shot.previousDesignBinding={versionId:shot.versionId,artifactSha256:shot.artifactSha256,artifactPublicUrl:shot.artifactPublicUrl};
      shot.semanticJob=candidate.semanticJob;
      shot.actionContract=structuredClone(candidate.actionContract);
      shot.physicalMotionContract=structuredClone(candidate.physicalMotionContract);
      Object.assign(shot,{versionId,artifactSha256:candidate.sha256,artifactPublicUrl:candidate.publicUrl,source:candidate.sourceKind||"IMAGEGEN_WITH_VERIFIED_DOCUMENT",assetBindingStatus:"CURRENT_STATIC_BOUND_MOTION_REVIEW_REQUIRED",reviewOnly:true,productionAdmission:false,prototypeEligible:false,singleShotMotionCanaryAuthorization:null,motionReviewReceipt:null});
      shot.designApproval={status:"APPROVED",scope:"SINGLE_SHOT_STATIC_DIRECTION",candidateSha256:candidate.sha256,userDirective:record.userDirective,approvedAt:new Date().toISOString()};
      shot.approvedDesignCandidate=candidate;
      shot.timeRange ||= structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items.find(item=>item.shotId===shot.shotId).timeRange);
      shot.motionDesignContract=deriveStoryboardMotionDesignContract(shot,{exactIdentityBinding:true,formalCopyRequired:true,independentGenerativeActor:false,geometryFingerprint:candidate.sha256,visualActor:shot.semanticJob,semanticAction:shot.actionContract.hold,choreographyBlueprint:candidate.choreographyBlueprint||"MATERIAL_GATHER_CONSTRAINT_ATTACH_DOCUMENT_HANDOFF",physicalMotionContract:shot.physicalMotionContract});
      shot.motionDesignStatus=shot.motionDesignContract.review.status;
      shot.motionReviewPlan={viewerRequirements:shot.motionReviewPlan?.viewerRequirements?{...shot.motionReviewPlan.viewerRequirements,bindingStale:true}:undefined,viewerReview:shot.motionReviewPlan?.viewerRequirements?{status:"PENDING_INTERNAL_SEQUENCE_REVIEW"}:undefined,shotId:shot.shotId,source:motionReviewSource(shot),action:"BUILD_LOCAL_CANARY",reason:candidate.motionReason||"用户已确认静态构图；本地制作材料归拢、约束附着、正文交接。",generationAllowed:false,productionAdmission:false};
      const update=(item)=>item.shotId!==shot.shotId?item:{...item,artifactSha256:candidate.sha256,artifactPublicUrl:candidate.publicUrl,previewPublicUrl:candidate.publicUrl,preview:{kind:"IMAGEGEN_LOOK_MASTER",publicUrl:candidate.publicUrl,sha256:candidate.sha256,provenance:"USER_APPROVED_DESIGN_CANDIDATE"},currentStoryboardVersionId:versionId,currentStoryboardVersionStatus:"CURRENT_REVIEW_ONLY",reviewOnly:true,productionAdmission:false};
      const board=next.production.shotIntelligence.wholeFilmStaticBoard;
      board.items=(board.items||[]).map(update);board.timelineBoard.items=board.timelineBoard.items.map(update);
      changed=true;
    } else if (mode === "plan") {
      if (!["BUILD_LOCAL_CANARY", "BUILD_SCREEN_CANARY", "SOURCE_RECAPTURE_REQUIRED", "REUSE_REVIEW_REQUIRED", "REDESIGN_REQUIRED", "NO_PACKAGE"].includes(record.action) || !record.reason || !input.userDirective) throw new Error("motion-review-plan-invalid");
      const effectiveRecord=mergeMotionReviewPlan(shot.motionReviewPlan,record);
      assertUnifiedScreenSelection({...shot,motionReviewPlan:effectiveRecord},effectiveRecord.productionBaseline);
      changed ||= JSON.stringify(shot.motionReviewPlan) !== JSON.stringify(effectiveRecord);
      shot.motionReviewPlan = effectiveRecord;
      if (record.approvedReference) {
        const {readPackagingReferenceMedia}=await import('../apps/studio-next/src/lib/a1-packaging-reference-media-v1.mjs');
        readPackagingReferenceMedia(next,{role:'packaging-reference',shotId:shot.shotId,sha256:record.approvedReference.video?.sha256,...Object.fromEntries(['versionId','artifactSha256','motionDesignSha256','durationMs'].map(k=>[k,String(record.source[k])]))},root);
      }
      if (record.designCandidate) {
        const candidate = record.designCandidate;
        const relative = candidate.publicUrl?.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
        if (record.action !== "REDESIGN_REQUIRED" || candidate.productionAdmission !== false || !relative?.startsWith("shot-motion-review-v1/") || relative.includes("..")) throw new Error("motion-review-design-scope-invalid");
        const candidatePath = path.resolve(root, candidate.path);
        if (!candidatePath.startsWith(path.join(root, "work") + path.sep)) throw new Error("motion-review-design-path-invalid");
        const bytes = fs.readFileSync(candidatePath);
        if (sha(bytes) !== candidate.sha256) throw new Error("motion-review-design-sha-mismatch");
        const meta = await sharp(bytes).metadata();
        if (!meta.width || !meta.height || Math.abs(meta.width / meta.height - 16 / 9) > .02) throw new Error("motion-review-design-aspect-ratio");
        binaryFiles[relative] = bytes;
      }
      // Static creation and motion execution are different owners.
      if (["LOCAL_DETERMINISTIC_MOTION", "LOCAL_EVIDENCE_MOTION"].includes(shot.motionDesignContract?.executionRoute)) {
        if (shot.assetProducer === "IMAGEGEN_THEN_XIAOYUNQUE") shot.assetProducer = shot.source === "REAL_SOURCE" ? "REAL_SOURCE" : "IMAGEGEN";
        if (shot.assetBindingStatus === "USER_APPROVED_XIAOYUNQUE_LANE") shot.assetBindingStatus = "CURRENT_STATIC_BOUND_MOTION_REVIEW_REQUIRED";
      }
      if (shot.motionReviewReceipt) {
        try { assertMotionReviewReceipt(shot, shot.motionReviewReceipt); }
        catch { shot.motionReviewReceipt = {...shot.motionReviewReceipt, status: "STALE_REVIEW_REQUIRED"}; }
      }
    } else {
      assertMotionReviewReplacement(shot, record);
      const selected=shot.motionReviewPlan?.productionBaseline;
      const retained=selected?.mode==='KEEP_VERIFIED_SEQUENCE'&&selected.primaryCandidate.sha256===record.video?.sha256;
      if(selected && !retained && record.productionBaselineSha256!==unifiedSelectionHash(selected))throw new Error('unified-screen-receipt-must-bind-current-baseline');
      assertMotionReviewReceipt(shot, record);
      if(shot.motionReviewPlan?.viewerRequirements) {
        const viewing=auditShotViewingReadiness(shot.motionReviewPlan.viewerRequirements,{...record.validation?.viewerReview,durationMs:record.source?.durationMs},{phase:"record",videoSha256:record.video?.sha256});
        if(viewing.status!=="PASS")throw new Error(`internal-viewing-review-required:${viewing.failures.join(":")}`);
        const sequence=record.validation.viewerReview.sequenceReview;
        const sequencePath=path.resolve(root,sequence.path||"");
        if(!sequencePath.startsWith(path.join(root,"work")+path.sep) || !fs.existsSync(sequencePath) || sha(fs.readFileSync(sequencePath))!==sequence.videoSha256)throw new Error("sequence-review-media-missing-or-stale");
        shot.motionReviewPlan.viewerReview={status:"PASS",videoSha256:record.video.sha256,sequenceVideoSha256:sequence.videoSha256,reviewedAt:new Date().toISOString()};
      }
      if (!["BUILD_LOCAL_CANARY", "BUILD_SCREEN_CANARY"].includes(shot.motionReviewPlan?.action)) throw new Error("motion-review-local-plan-required");
      assertMotionReviewBinding(shot, shot.motionReviewPlan);
      (await import('./lib/assert-review-renderer-provenance-v1.mjs')).assertReviewRendererProvenance(root, record);
      const relative = record.video.publicUrl?.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
      if (!relative?.startsWith("shot-motion-review-v1/") || relative.includes("..")) throw new Error("motion-review-output-path-invalid");
      const local = path.resolve(root, record.video.path);
      if (!local.startsWith(path.join(root, "work") + path.sep)) throw new Error("motion-review-staging-path-invalid");
      const bytes = fs.readFileSync(local);
      if (sha(bytes) !== record.video.sha256) throw new Error("motion-review-output-sha-mismatch");
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", local], {encoding: "utf8"}));
      const video = probe.streams.find((s) => s.codec_type === "video");
      if (video?.width !== 960 || video?.height !== 540 || Math.abs(Number(probe.format.duration) * 1000 - record.source.durationMs) > 80) throw new Error("motion-review-media-contract-invalid");
      execFileSync("ffmpeg", ["-v", "error", "-i", local, "-f", "null", "-"], {stdio: "pipe"});
      if (["PACKAGED_SCREEN_REUSE","PACKAGED_SCREEN_TIMING_REUSE"].includes(record.kind)) {
        for(const upstream of [record.upstreamPackage,record.upstreamCapReceipt]){
          const file=path.resolve(root,upstream.path);
          if(!file.startsWith(path.join(root,'work')+path.sep)||sha(fs.readFileSync(file))!==upstream.sha256)throw new Error('packaged-screen-upstream-bytes-changed');
        }
        const capReceipt=JSON.parse(fs.readFileSync(path.resolve(root,record.upstreamCapReceipt.path),'utf8'));
        if(capReceipt.sourceStoryboardVersionId!==shot.versionId)throw new Error('packaged-screen-source-version-changed');
        if(record.kind==='PACKAGED_SCREEN_TIMING_REUSE'){
          const audio=current.production.assembly.mediaBindings.audio,expectedAudioPath=path.join(appRoot,'public',audio.publicUrl);
          if(record.narrationSource.sha256!==audio.sha256||path.resolve(root,record.narrationSource.path)!==expectedAudioPath||sha(fs.readFileSync(expectedAudioPath))!==audio.sha256)throw new Error('tail-timing-original-narration-changed');
        }
        if(probe.streams.some(s=>s.codec_type==='audio')||video.avg_frame_rate!=='60/1')throw new Error('packaged-screen-review-fps-or-audio-invalid');
      } else if (record.kind === "SCREEN_EVIDENCE") {
        const sourceFile = path.resolve(root, shot.motionReviewPlan.capturedSource.path);
        if (!sourceFile.startsWith(root + path.sep) || sha(fs.readFileSync(sourceFile)) !== record.capturedSource.sha256) throw new Error("screen-review-source-changed");
        if (probe.streams.some((s) => s.codec_type === "audio") || video.avg_frame_rate !== "60/1") throw new Error("screen-review-fps-or-audio-invalid");
      } else {
      const frameCount = Number(video.nb_frames);
      if (!Number.isSafeInteger(frameCount) || frameCount < 1) throw new Error("motion-review-frame-count-required");
      const lastPng = execFileSync("ffmpeg", ["-v", "error", "-i", local, "-vf", `select=eq(n\\,${frameCount - 1})`, "-vsync", "0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], {maxBuffer: 8 * 1024 * 1024});
      const last = await sharp(lastPng).removeAlpha().raw().toBuffer();
      const reference = await sharp(staticPath).resize(960, 540).removeAlpha().raw().toBuffer();
      const error = last.length === reference.length ? last.reduce((sum, byte, index) => sum + Math.abs(byte - reference[index]), 0) / last.length : Infinity;
      if (error > 5) throw new Error(`motion-review-encoded-final-parity:${error}`);
      }
      changed ||= JSON.stringify(shot.motionReviewReceipt) !== JSON.stringify(record);
      if (shot.motionReviewReceipt?.video?.sha256 !== record.video.sha256 && shot.motionReviewReceipt) {
        shot.motionReviewReceiptHistory = [...(shot.motionReviewReceiptHistory || []), shot.motionReviewReceipt];
      }
      shot.motionReviewReceipt = record;
      if(selected&&!retained)shot.motionReviewPlan.productionBaseline=completeUnifiedScreenSelection(selected,record.video);
      binaryFiles[relative] = bytes;
    }
  }
  for (const record of records) {
    const shot=authority.shots.find(s=>s.shotId===record.shotId);
    if(shot?.externalMotionReference && shot.externalMotionReference.source?.versionId!==shot.versionId) {
      shot.rejectedExternalMotionReference={...shot.externalMotionReference,status:"SUPERSEDED_BY_CURRENT_LOCAL_DESIGN",sourceScope:"HISTORY_READ_ONLY"};
      shot.externalMotionReference=null;
      changed=true;
    }
  }
  if (!changed) return {status: "NOOP_ALREADY_CURRENT", workspaceSha256: current.workspaceSha256};
  const now = new Date().toISOString();
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if(mode==="adopt-design") {
    if(recalculated.gates.motionPrototypeAllowed!==false||recalculated.gates.finalRenderAllowed!==false||recalculated.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval!==current.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval)throw new Error("design-adoption-global-approval-drift");
  } else {
    const beforeBoundary=boundary(current),afterBoundary=boundary(recalculated);
    const newDesignReview=mode==="plan" && records.every(r=>r.action==="REDESIGN_REQUIRED" && r.designCandidate)
      && afterBoundary.nextAction?.id==="review-current-shot-design-candidates"
      && JSON.stringify({...beforeBoundary,nextAction:null})===JSON.stringify({...afterBoundary,nextAction:null});
    if(!newDesignReview && JSON.stringify(beforeBoundary)!==JSON.stringify(afterBoundary))throw new Error("motion-review-global-boundary-drift");
  }
  const inputSha256 = motionReviewHash(input);
  files[`shot-motion-review-v1/${mode}-${inputSha256}.json`] = input;
  const event = createProductionEvent({workspace: current, action: `reconcile-shot-motion-review-${mode}`, targetId: inputSha256, payload: {shotIds: records.map((r) => r.shotId), inputSha256, productionAdmission: false, userDirective: ["plan","adopt-design"].includes(mode) ? input.userDirective : undefined}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const saved = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files, binaryFiles});
  return {status: "PASS", mode, shotIds: records.map((r) => r.shotId), workspaceSha256After: saved.workspaceSha256, productionAdmission: false};
});
console.log(JSON.stringify(result, null, 2));
