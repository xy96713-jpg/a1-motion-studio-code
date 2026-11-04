#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync, spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import sharp from "sharp";
import {sha256Json, writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "system-validation-candidate-v1");
const publicPrefix = "/generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1";
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath = path.join(generatedRoot, "workspace.json");
const boardReportPath = path.join(generatedRoot, "whole-film-static-board-v1/report.json");
const legacyPropsPath = path.join(generatedRoot, "whole-film-motion-plan-v1/input-props.json");
const fourShotAuditPath = path.join(generatedRoot, "four-shot-narrow-repair-v1/audit-report.json");
const typographyDirectionPath = path.join(generatedRoot, "typography-direction.json");
const entryPath = path.join(rendererRoot, "src/system-validation-candidate-index.tsx");
const smokeSourcePath = path.join(rendererRoot, "src/SystemValidationSmokeFixtures.tsx");
const fullSourcePath = path.join(rendererRoot, "src/WholeFilmApprovedMasterMotionReview.tsx");
const fontPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const styleAudit = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";
const referenceManifestPath = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/assets/reference-pack/pinterest-retro-pixel-v1/manifest.json";
const referenceRoot = path.dirname(referenceManifestPath);
const expected = {
  packageBoard: "f29f168c6944659843b0c9854ebac8661cf7a9cedfb70ad89aaec8a4e855a174",
  timelineBoard: "db81510968d102879db20d1bb6cf28b39b1bc3cfa689f23fc1b99741c74cc306",
  shots: {
    "ED-12": "99e363c6c66a74ee0a9bb22af10cb50ea24ffa98a08eee001c656e96d5cc4603",
    "ED-13": "7304a789a551b1c1de78062e01f71bd5559fdcd289691723d5b5f0c233f9ef53",
    "ED-16": "dabb20710dcb12691971bbdd1f5dc678c52d4d624474d6a09332330c23add04e",
    "ED-31": "31ae46accd7a384b64d0ed2fe85fbb2f0435b64fa518c13b021ffdac22976004",
  },
};
const representativeShotIds = ["ED-08", "ED-12", "ED-13", "ED-16", "ED-31"];
const exactRasterCopyByShot = {
  "ED-07": ["为什么不让它", "直接写完全文"],
  "ED-08": ["AI 常常不说人话"],
  "ED-09": ["明明都是中文", "有点看不懂"],
  "ED-10": ["完成度", "很高的废稿"],
  "ED-14": ["句法多样性下降", "词汇多样性下降"],
  "ED-17": ["先给材料", "再找角度", "最后再让 AI 动笔"],
  "ED-19": ["整理 编排", "读取", "检查"],
  "ED-33": ["系统能让它更加可控", "不至于推翻重来"],
  "ED-34": ["它会根据你的喜好，", "来决定这篇文章到底", "往哪个方向走，", "真正写出你", "自己的风格。"],
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const relative = (file) => path.relative(root, file);
const publicUrl = (file) => `${publicPrefix}/${path.relative(outputRoot, file).split(path.sep).join("/")}`;
const cleanOutput = (value) => String(value || "").trim();
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, {cwd: root, encoding: "utf8", stdio: options.quiet ? "pipe" : "inherit", ...options});
  if (result.status !== 0) throw new Error(`${path.basename(program)} failed (${result.status}): ${cleanOutput(result.stderr || result.stdout).slice(-1200)}`);
  return result;
};
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,size:stream=index,codec_name,codec_type,width,height,avg_frame_rate,pix_fmt", "-of", "json", file], {encoding:"utf8"}));
const asset = (file, url = publicUrl(file)) => ({path: relative(file), publicUrl:url, sha256:fileSha256(file), bytes:fs.statSync(file).size});
const normalizeObservedCopy = (value) => String(value || "")
  .replace(/Al/gu, "AI")
  .replace(/[\s，。！？、·:：；;（）()？?]/gu, "")
  .toUpperCase();

fs.mkdirSync(outputRoot, {recursive:true});
const startedAt = performance.now();
const beforeAuthority = {phaseSha256:fileSha256(phasePath), workspaceSha256:fileSha256(workspacePath)};
const phase = readJson(phasePath);
const boardReport = readJson(boardReportPath);
const legacyProps = readJson(legacyPropsPath);
const fourShotAudit = readJson(fourShotAuditPath);
const referenceManifest = readJson(referenceManifestPath);
const typographyDirection = readJson(typographyDirectionPath);

assert.match(String(phase.reviewDecision?.userVisualApproval || ""), /APPROVAL_REQUIRED|NOT_APPROVED/u, "canonical user approval must remain explicitly pending");
assert.equal(phase.reviewDecision?.motionPrototypeAllowed, false, "canonical motion gate must remain locked");
assert.equal(boardReport.board.sha256, expected.packageBoard);
assert.equal(boardReport.timelineBoard.sha256, expected.timelineBoard);
assert.equal(boardReport.items.length, 13);
assert.equal(boardReport.timelineBoard.items.length, 34);
for (const [shotId, hash] of Object.entries(expected.shots)) assert.equal(boardReport.items.find((item) => item.shotId === shotId)?.artifactSha256, hash, `${shotId} current hash mismatch`);
assert.equal(fourShotAudit.boundary?.userVisualApproval || fourShotAudit.userVisualApproval, "NOT_APPROVED");

for (const binding of [legacyProps.media.presenterVideo, legacyProps.media.narrationAudio, legacyProps.media.subtitles]) {
  const file = path.join(publicRoot, binding.publicUrl.replace(/^\//u, ""));
  assert.equal(fs.existsSync(file), true, `source media missing: ${binding.publicUrl}`);
}
for (const item of boardReport.items) {
  const file = path.join(publicRoot, item.artifactPublicUrl.replace(/^\//u, ""));
  assert.equal(fileSha256(file), item.artifactSha256, `${item.shotId} selected master changed`);
}

const boardByShot = new Map(boardReport.items.map((item) => [item.shotId, item]));
const timelineByShot = new Map(boardReport.timelineBoard.items.map((item) => [item.shotId, item]));
const track = (property, from, to, startFrame, endFrame, easing=[0.16,1,0.3,1]) => ({contract:"A1MotionPropertyTrack/v1",property,from,to,startFrame,endFrame,easing});
const semanticRasterSlicesByShot = {
  "ED-08": [
    {id:"ai-anchor",role:"premise-actor",semanticJob:"establish the AI subject before the verdict",bounds:{x:0,y:0,width:.36,height:1},motion:{property:"translateX",from:-28,to:0}},
    {id:"verdict-phrase",role:"verdict-actor",semanticJob:"lock the plain-language verdict as the dominant reading",bounds:{x:.36,y:0,width:.38,height:1},motion:{property:"translateY",from:20,to:0}},
    {id:"cobalt-swipe",role:"semantic-accent",semanticJob:"sweep cobalt through the conclusion without becoming decoration",bounds:{x:.74,y:0,width:.26,height:1},motion:{property:"translateX",from:32,to:0}},
  ],
  "ED-12": [
    {id:"trial-claim",role:"setup-actor",semanticJob:"state the five-model trial before entity comparison",bounds:{x:0,y:0,width:.48,height:1},motion:{property:"translateX",from:-24,to:0}},
    {id:"model-cluster-a",role:"evidence-actor",semanticJob:"introduce the first model cluster",bounds:{x:.48,y:0,width:.52,height:.52},motion:{property:"translateY",from:-22,to:0}},
    {id:"model-cluster-b",role:"evidence-actor",semanticJob:"complete the comparison with the second model cluster",bounds:{x:.48,y:.52,width:.52,height:.48},motion:{property:"translateY",from:24,to:0}},
  ],
  "ED-13": [
    {id:"problem-title",role:"mechanism-title",semanticJob:"name the causal problem before the diagram settles",bounds:{x:0,y:0,width:1,height:.27},motion:{property:"translateY",from:-18,to:0}},
    {id:"context-field",role:"context-actor",semanticJob:"establish fragmented context around the live presenter",bounds:{x:0,y:.27,width:.55,height:.73},motion:{property:"translateX",from:-20,to:0}},
    {id:"context-knot",role:"mechanism-actor",semanticJob:"tighten the context knot while preserving the presenter",bounds:{x:.55,y:.27,width:.45,height:.73},motion:{property:"scale",from:.94,to:1}},
  ],
  "ED-16": [
    {id:"material-gap",role:"cause-actor",semanticJob:"show insufficient material as the first cause",bounds:{x:0,y:0,width:.34,height:1},motion:{property:"translateX",from:-28,to:0}},
    {id:"freedom-gap",role:"cause-actor",semanticJob:"show unclear freedom as the second cause",bounds:{x:.34,y:0,width:.33,height:1},motion:{property:"translateY",from:22,to:0}},
    {id:"vague-output",role:"effect-actor",semanticJob:"resolve the chain into a vague-output effect",bounds:{x:.67,y:0,width:.33,height:1},motion:{property:"translateX",from:28,to:0}},
  ],
  "ED-31": [
    {id:"control-title",role:"conclusion-title",semanticJob:"state the controllable-process conclusion",bounds:{x:0,y:0,width:1,height:.25},motion:{property:"translateY",from:-18,to:0}},
    {id:"pixel-trail",role:"process-origin",semanticJob:"start the process trail behind the live presenter",bounds:{x:0,y:.25,width:.58,height:.75},motion:{property:"translateX",from:-24,to:0}},
    {id:"control-ribbon",role:"process-result",semanticJob:"complete the process as a controlled forward ribbon",bounds:{x:.58,y:.25,width:.42,height:.75},motion:{property:"translateX",from:30,to:0}},
  ],
};
const motionScene = (beat, mode) => {
  const revealEnd = Math.min(Math.max(14, Math.round(beat.durationInFrames * .18)), 28);
  const presenter = /PRESENTER/u.test(mode);
  const explainer = /EXPLAINER/u.test(mode);
  const typography = /TYPOGRAPHY|FULLSCREEN/u.test(mode);
  const properties = presenter
    ? [track("opacity",0,1,0,revealEnd),track("translateX",-18,0,0,revealEnd)]
    : explainer
      ? [track("opacity",0,1,0,revealEnd),track("clip",.18,1,0,revealEnd),track("scale",1.012,1,0,revealEnd)]
      : typography
        ? [track("opacity",0,1,0,revealEnd),track("scale",1.035,1,0,revealEnd)]
        : [track("opacity",0,1,0,revealEnd),track("translateY",18,0,0,revealEnd)];
  const semanticSlices=semanticRasterSlicesByShot[beat.shotId]||null;
  const actors=semanticSlices
    ? semanticSlices.map((slice,index)=>{
        const startFrame=Math.min(index*4,Math.max(0,revealEnd-8));
        const endFrame=Math.min(revealEnd,startFrame+Math.max(12,revealEnd-4));
        const propertyTracks=[track("opacity",0,1,startFrame,endFrame),track(slice.motion.property,slice.motion.from,slice.motion.to,startFrame,endFrame)];
        return {id:slice.id,role:slice.role,semanticJob:slice.semanticJob,startFrame,endFrame,curveId:"semantic-staggered-reveal",easing:[0.16,1,0.3,1],from:Object.fromEntries(propertyTracks.map((item)=>[item.property,item.from])),to:Object.fromEntries(propertyTracks.map((item)=>[item.property,item.to])),propertyTracks};
      })
    : [{id:"final-lock",role:"integrated-look-master",semanticJob:presenter?"reveal support without crossing presenter":explainer?"reveal causal or entity structure":"establish one editorial statement",startFrame:0,endFrame:revealEnd,curveId:"editorial-reveal",easing:[0.16,1,0.3,1],from:Object.fromEntries(properties.map((item)=>[item.property,item.from])),to:Object.fromEntries(properties.map((item)=>[item.property,item.to])),propertyTracks:properties}];
  return {
    contract:"A1MotionIRScene/v2",sceneId:`system-validation-${beat.shotId}`,sourceMotionContract:"A1SystemValidationSemanticMotion/v1",
    sourceAuthority:"SYSTEM_VALIDATION_CANDIDATE_ONLY",reviewOnly:true,promotedRender:false,
    timing:{fps:30,frameStart:0,frameDuration:beat.durationInFrames,duration:beat.durationInFrames/30},
    phases:{establish:[0,revealEnd],lock:[revealEnd,Math.max(revealEnd,beat.durationInFrames-1)]},
    actors,
  };
};

const inputPropsPath=path.join(outputRoot,"input-props.json");
const previousInputProps=fs.existsSync(inputPropsPath)?readJson(inputPropsPath):null;
const beats = legacyProps.beats.map((beat) => {
  if (beat.kind === "SCREEN_EVIDENCE") {
    const current=timelineByShot.get(beat.shotId);
    assert.ok(current?.previewPublicUrl&&current?.artifactSha256,`current screen evidence missing: ${beat.shotId}`);
    const file=path.join(publicRoot,current.previewPublicUrl.replace(/^\//u,""));
    assert.equal(fileSha256(file),current.artifactSha256,`${beat.shotId} screen evidence hash mismatch`);
    return {...beat,screen:{...beat.screen,asset:{...beat.screen.asset,publicUrl:current.previewPublicUrl,sha256:current.artifactSha256}}};
  }
  if (beat.kind !== "PACKAGE") return beat;
  const current = boardByShot.get(beat.shotId);
  assert.ok(current, `package beat missing from current board: ${beat.shotId}`);
  const mode = current.presentationMode || beat.package.mode;
  const keepPresenterMatte = ["ED-13","ED-31"].includes(beat.shotId) ? beat.package.presenterMatte : null;
  if (keepPresenterMatte) {
    const matteFile = path.join(publicRoot, keepPresenterMatte.publicUrl.replace(/^\//u, ""));
    assert.equal(fileSha256(matteFile), keepPresenterMatte.sha256, `${beat.shotId} presenter matte mismatch`);
  }
  const binding = {publicUrl:current.artifactPublicUrl,sha256:current.artifactSha256,width:1920,height:1080};
  const semanticRasterSlices=semanticRasterSlicesByShot[beat.shotId]?.map(({motion:_motion,...slice})=>slice)||[];
  return {...beat,route:"SYSTEM_VALIDATION_CANDIDATE_ONLY",routeLabel:"独立候选验证",sourceRole:"CURRENT_CANONICAL_LOOK_MASTER",package:{mode,semanticIntent:beat.sourceText,selectedLookMaster:binding,finalComposite:binding,layers:{},presenterMatte:keepPresenterMatte,semanticRasterSlices,motionIrScene:motionScene(beat, mode)}};
});
const inputProps = {...legacyProps,reviewOnly:true,promotedRender:false,finalRelease:false,beats,captions:{...legacyProps.captions,cueCount:0,cues:[]}};
const bindingFingerprint=(beat)=>beat?.kind==="PACKAGE"?beat.package?.finalComposite?.sha256:beat?.kind==="SCREEN_EVIDENCE"?beat.screen?.asset?.sha256:beat?.kind;
const previousBeatByShot=new Map((previousInputProps?.beats||[]).map((beat)=>[beat.shotId,beat]));
const changedBeatIds=beats.filter((beat)=>bindingFingerprint(previousBeatByShot.get(beat.shotId))!==bindingFingerprint(beat)).map((beat)=>beat.shotId);
writeJsonAtomic(inputPropsPath, inputProps);

const alphaOverlayShotIds=["ED-13","ED-31"];
const alphaOverlayRoot=path.join(outputRoot,"alpha-overlays");
fs.mkdirSync(alphaOverlayRoot,{recursive:true});
const alphaOverlayPlans=[];
for(const shotId of alphaOverlayShotIds){
  const beat=beats.find((item)=>item.shotId===shotId);
  assert.equal(beat?.kind,"PACKAGE",`${shotId} alpha package beat required`);
  assert.ok(beat.package.presenterMatte?.publicUrl,`${shotId} presenter matte required`);
  const masterFile=path.join(publicRoot,beat.package.finalComposite.publicUrl.replace(/^\//u,""));
  const matteFile=path.join(publicRoot,beat.package.presenterMatte.publicUrl.replace(/^\//u,""));
  const sourceFile=path.join(alphaOverlayRoot,`${shotId}-package-over-presenter.png`);
  const sourceKey=sha256Json({contract:"A1SystemValidationInversePresenterMatte/v3",shotId,masterSha256:fileSha256(masterFile),presenterMatteSha256:fileSha256(matteFile)});
  const sourceSidecar=`${sourceFile}.json`;
  const priorSource=fs.existsSync(sourceSidecar)?readJson(sourceSidecar):null;
  if(!(priorSource?.sourceKey===sourceKey&&fs.existsSync(sourceFile)&&priorSource.sha256===fileSha256(sourceFile))){
    const {data:masterRgb,info}=await sharp(masterFile).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const inversePresenterAlpha=await sharp(matteFile)
      .resize(info.width,info.height,{fit:"fill",kernel:"nearest"})
      .ensureAlpha()
      .extractChannel(3)
      .negate()
      .raw()
      .toBuffer();
    await sharp(masterRgb,{raw:{width:info.width,height:info.height,channels:3}})
      .joinChannel(inversePresenterAlpha,{raw:{width:info.width,height:info.height,channels:1}})
      .png()
      .toFile(sourceFile);
    writeJsonAtomic(sourceSidecar,{contract:"A1SystemValidationInversePresenterMatteCache/v1",sourceKey,sha256:fileSha256(sourceFile)});
  }
  alphaOverlayPlans.push({shotId,durationInFrames:beat.durationInFrames,sourceFile,sourcePublicUrl:publicUrl(sourceFile),sourceSha256:fileSha256(sourceFile),outputFile:path.join(alphaOverlayRoot,`${shotId}-package-overlay-prores4444.mov`),sourceKey});
}

const renderPublicRoot=path.join(root,".codex-artifacts/system-progress-system-line/system-validation-render-public-v1");
const renderPublicUrls=new Set([
  inputProps.media.presenterVideo.publicUrl,inputProps.media.narrationAudio.publicUrl,inputProps.media.subtitles.publicUrl,
  "/a1-editorial-fonts/fusion-pixel.ttf",
]);
for(const plan of alphaOverlayPlans)renderPublicUrls.add(plan.sourcePublicUrl);
for(const beat of beats){
  if(beat.kind==="SCREEN_EVIDENCE")renderPublicUrls.add(beat.screen.asset.publicUrl);
  if(beat.kind==="PACKAGE"){
    renderPublicUrls.add(beat.package.finalComposite.publicUrl);
    if(beat.package.presenterMatte?.publicUrl)renderPublicUrls.add(beat.package.presenterMatte.publicUrl);
  }
}
let renderPublicBytes=0;
for(const url of renderPublicUrls){
  const relativeUrl=url.replace(/^\//u,"");
  const source=path.join(publicRoot,relativeUrl);
  const destination=path.join(renderPublicRoot,relativeUrl);
  assert.equal(fs.existsSync(source),true,`render public source missing: ${url}`);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination)&&fileSha256(destination)!==fileSha256(source))fs.rmSync(destination,{force:true});
  if(!fs.existsSync(destination)){
    try{fs.linkSync(source,destination);}catch{fs.copyFileSync(source,destination);}
  }
  renderPublicBytes+=fs.statSync(source).size;
}
const renderPublic={root:relative(renderPublicRoot),assetCount:renderPublicUrls.size,logicalBytes:renderPublicBytes,recursiveProductionPublicScan:false,wholePublicDirectoryBundled:false};

const fontSha = fileSha256(fontPath);
assert.equal(fontSha, "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32");

const typographyAuditPath=path.join(outputRoot,"editable-typography-specs.json");
const typographyInputSha256=sha256Json({
  contract:"A1SystemValidationTypographyInput/v1",
  schemaRevision:"candidate-editable-spec-v2",
  boardSha256:boardReport.board.sha256,
  masters:boardReport.items.map(({shotId,artifactSha256})=>({shotId,artifactSha256})),
  fourShotAuditSha256:fileSha256(fourShotAuditPath),
  typographyDirectionSha256:fileSha256(typographyDirectionPath),
  visionSourceSha256:fileSha256(path.join(root,"scripts/run-local-vision-ocr-v1.swift")),
  fontSha256:fontSha,
});
const fourShotCandidateById=new Map((fourShotAudit.candidates||[]).map((candidate)=>[candidate.shotId,candidate]));
let typographyAudit=fs.existsSync(typographyAuditPath)?readJson(typographyAuditPath):null;
if (!(typographyAudit?.contract==="A1SystemValidationEditableTypographyCoverage/v1"&&typographyAudit?.inputSha256===typographyInputSha256&&typographyAudit?.entries?.length===13)) {
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),"a1-system-validation-ocr-"));
  const visionBinary=path.join(tempRoot,"vision-ocr");
  try {
    run("swiftc",[path.join(root,"scripts/run-local-vision-ocr-v1.swift"),"-o",visionBinary],{quiet:true});
    const entries=[];
    for(const item of boardReport.items){
      const candidate=fourShotCandidateById.get(item.shotId);
      if(candidate?.textNodes?.length){
        entries.push({
          shotId:item.shotId,
          status:"EDITABLE_GEOMETRY_VERIFIED",
          selectedMasterSha256:item.artifactSha256,
          exactCopy:candidate.textNodes.map((node)=>node.text),
          nodes:candidate.textNodes,
          editableRenderReady:true,
          candidateEditableSpecReady:true,
          canonicalEditableLayerReady:true,
          currentRenderedTextProvenance:"LOCAL_HASH_BOUND_EDITABLE_NODES",
          fontBindings:[...new Map(candidate.textNodes.map((node)=>[node.fontSha256,{assetId:node.fontAssetId,family:node.fontFamily,sha256:node.fontSha256}])).values()],
          evidence:{kind:"FOUR_SHOT_CURRENT_AUDIT",path:relative(fourShotAuditPath),actualPixels:true},
          postApprovalRequirement:null,
        });
        continue;
      }
      const imagePath=path.join(publicRoot,item.artifactPublicUrl.replace(/^\//u,""));
      const ocr=JSON.parse(run(visionBinary,[imagePath],{quiet:true}).stdout);
      assert.equal(ocr.status,"PASS",`${item.shotId} current master OCR failed`);
      const expectedCopy=exactRasterCopyByShot[item.shotId];
      assert.ok(expectedCopy,`${item.shotId} exact raster copy audit missing`);
      const observedDetails=item.shotId==="ED-14"
        ? ocr.segmentDetails.filter((segment)=>segment.boundingBox?.x>0.6&&/下降/u.test(segment.text))
        : ocr.segmentDetails;
      const observedText=observedDetails.map((segment)=>segment.text).join(" ");
      assert.equal(normalizeObservedCopy(observedText).includes(normalizeObservedCopy(expectedCopy.join(""))),true,`${item.shotId} OCR no longer matches audited exact copy`);
      entries.push({
        shotId:item.shotId,
        status:"ACTUAL_PIXEL_COPY_OBSERVED_POST_APPROVAL_REBUILD_REQUIRED",
        selectedMasterSha256:item.artifactSha256,
        exactCopy:expectedCopy,
          nodes:observedDetails.map((segment,index)=>({
          id:`${item.shotId.toLowerCase()}-observed-${index+1}`,
          text:expectedCopy[index]||segment.text,
          observedText:segment.text,
          normalizedBoundingBox:segment.boundingBox,
          ocrConfidence:segment.confidence,
            geometrySource:"VISION_OCR_ACTUAL_PIXEL_OBSERVATION",
            editable:false,
            candidateEditableGeometry:true,
            fontAssetId:"type-pixel-correction",
            fontFamily:"A1 Fusion Pixel",
            fontSha256:fontSha,
          })),
          editableRenderReady:false,
          candidateEditableSpecReady:true,
          canonicalEditableLayerReady:false,
        currentRenderedTextProvenance:"RASTER_MASTER_EXACT_COPY_OBSERVED_FONT_PROVENANCE_NOT_PROVEN_BY_OCR",
        reconstructionFontBinding:{assetId:"type-pixel-correction",family:"A1 Fusion Pixel",sha256:fontSha,policy:"POST_APPROVAL_LOCAL_EDITABLE_REBUILD"},
        evidence:{kind:"VISION_OCR_ACTUAL_PIXEL_AUDIT",sourceMasterPublicUrl:item.artifactPublicUrl,sourceMasterSha256:item.artifactSha256,recognitionLevel:ocr.recognitionLevel,actualPixels:true},
        postApprovalRequirement:"REBUILD_AS_EDITABLE_TEXT_LAYER_AFTER_EXPLICIT_USER_VISUAL_APPROVAL",
      });
    }
    const body={
      contract:"A1SystemValidationEditableTypographyCoverage/v1",
      status:"SPECIFICATION_COMPLETE_LAYER_READINESS_BLOCKED_BY_USER_APPROVAL",
      inputSha256:typographyInputSha256,
      sourceBoardSha256:boardReport.board.sha256,
      entryCount:entries.length,
      editableRenderReadyCount:entries.filter((entry)=>entry.editableRenderReady).length,
      candidateEditableSpecReadyCount:entries.filter((entry)=>entry.candidateEditableSpecReady).length,
      canonicalEditableLayerReadyCount:entries.filter((entry)=>entry.canonicalEditableLayerReady).length,
      postApprovalRebuildCount:entries.filter((entry)=>!entry.editableRenderReady).length,
      entries,
      policy:{generatedFormalTextAllowed:false,ocrIsEditableSource:false,unknownRasterFontMayNotBeClaimedAsHashBound:true,postApprovalReconstructionFont:{assetId:"type-pixel-correction",family:"A1 Fusion Pixel",sha256:fontSha}},
      boundary:{userVisualApproval:"NOT_APPROVED",layerExtractionPerformed:false,canonicalMastersChanged:false},
    };
    typographyAudit={...body,auditSha256:sha256Json(body),generatedAt:new Date().toISOString()};
    writeJsonAtomic(typographyAuditPath,typographyAudit);
  } finally {
    fs.rmSync(tempRoot,{recursive:true,force:true});
  }
}
assert.equal(typographyAudit.entryCount,13);
assert.equal(typographyAudit.editableRenderReadyCount,4);
assert.equal(typographyAudit.candidateEditableSpecReadyCount,13);
assert.equal(typographyAudit.canonicalEditableLayerReadyCount,4);
assert.equal(typographyAudit.postApprovalRebuildCount,9);
const typographyByShot=new Map(typographyAudit.entries.map((entry)=>[entry.shotId,entry]));
const reference = (id, traits) => {
  const item = referenceManifest.sources.find((entry) => entry.id === id);
  assert.ok(item);
  return {id,sourceUrl:`file://${path.join(referenceRoot,item.file)}`,sha256:item.sha256,adoptedTraits:traits};
};
const genreSpecs = [
  {id:"opinion",semanticJob:"用单一判断和克制反差表达观点，不伪装成数据证据",family:"pixel-type-actor",support:["dithered-editorial-poster"],surface:"dark editorial stage",actor:"large verdict typography",composition:"left statement with isolated counterweight",palette:"charcoal cobalt paper",material:"coarse pixel edge",motion:"decisive settle",tone:"charcoal",refs:[["pinterest-retro-pixel-04",["bold pixel verdict"]],["pinterest-retro-pixel-06",["editorial contrast"]]]},
  {id:"tutorial",semanticJob:"把真实操作顺序拆成三个可读步骤并保持失败处理词组完整",family:"modular-pixel-infographic",support:["retro-computer-window"],surface:"modular instruction cards",actor:"three numbered steps",composition:"equal three column procedure",palette:"cool gray ink cobalt",material:"flat print blocks",motion:"sequential rise",tone:"cool-gray",refs:[["pinterest-retro-pixel-03",["modular information"]],["pinterest-retro-pixel-06",["compact labels"]]]},
  {id:"data-explanation",semanticJob:"以单位人口作为完整统计口径展示相对关系而不虚构真实数据来源",family:"dithered-editorial-poster",support:["modular-pixel-infographic"],surface:"dark chart field",actor:"four proportional bars",composition:"number column plus chart",palette:"charcoal slate cobalt",material:"screen grain",motion:"bar build",tone:"charcoal",refs:[["pinterest-retro-pixel-07",["high contrast data block"]],["pinterest-retro-pixel-01",["pixel chart density"]]]},
  {id:"product-analysis",semanticJob:"用界面窗口结构分析产品入口和选择成本而不是伪造软件录屏",family:"retro-computer-window",support:["icon-atlas-interface-language"],surface:"printed software window",actor:"single product window",composition:"analysis statement and three states",palette:"neutral paper ink cobalt",material:"hard frame ink",motion:"window lock",tone:"neutral-white",refs:[["pinterest-retro-pixel-02",["retro window frame"]],["pinterest-retro-pixel-05",["interface object rhythm"]]]},
  {id:"personal-narrative",semanticJob:"用一张抽象记忆卡和一句亲历判断表达个人叙事，不生成具体人物",family:"one-bit-character-object",support:["pixel-type-actor"],surface:"quiet memory card",actor:"empty photographic frame",composition:"asymmetric card and reflection",palette:"neutral paper cobalt ink",material:"soft photocopy edge",motion:"memory card drift",tone:"neutral-white",refs:[["pinterest-retro-pixel-09",["light one bit object"]],["pinterest-retro-pixel-06",["quiet editorial whitespace"]]],light:true},
];
const styleBriefs = [];
for (const spec of genreSpecs) {
  const brief = {
    contract:"A1RetroPixelEditorialStyleBrief/v1",referencePackId:"pinterest-retro-pixel-v1",fixtureId:spec.id,semanticJob:spec.semanticJob,
    sourceReferences:spec.refs.map(([id,traits])=>reference(id,traits)),
    atmosphere:{earlyComputerIntimacy:true,editorialUrgency:true,tactileImperfection:true,playfulIntelligence:true},
    variation:{primaryFamily:spec.family,supportingFamilies:spec.support,surfaceLogic:spec.surface,dominantActor:spec.actor,composition:spec.composition,palette:spec.palette,material:spec.material,motionEnergy:spec.motion},
    styleProfile:{id:"editorial-collision-retro-pixel-v2",backgroundPolicy:"neutral-canvas-v1",accentPolicy:"cobalt-semantic-only",specificPeopleDefault:false},
    surfacePolicy:{backgroundTone:spec.tone,yellowCastForbidden:true,warmBackgroundUserApproved:false},
    visualWeight:spec.light?{profile:"light-one-bit-story-screen-v1",interfaceChrome:"thin",maxControlRegions:1,sceneLedTitleMaxHeightPercent:16,maxHeavyBlackCoveragePercent:28,maxAccentCoveragePercent:7}:{profile:"editorial-collision-controlled-v1"},
    typography:{editableTextRequired:true,systemFallbackForbidden:true,generatedFormalTextAllowed:false,displayFontAssetId:"a1-fusion-pixel",supportFontAssetId:"a1-fusion-pixel",fontFiles:[{assetId:"a1-fusion-pixel",path:fontPath,sha256:fontSha}]},
    formalOutput:{debugFree:true,referenceOnlyAssetsExcluded:true,fakeEvidenceForbidden:true},
  };
  brief.fingerprint=[brief.variation.primaryFamily,brief.variation.surfaceLogic,brief.variation.dominantActor,brief.variation.composition,brief.variation.palette].join("|");
  const briefPath = path.join(outputRoot, "style-briefs", `${spec.id}.json`);
  writeJsonAtomic(briefPath, brief);
  const result = run(process.execPath, [styleAudit, briefPath], {quiet:true});
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.status, "PASS", `${spec.id} style audit failed`);
  const auditPath = path.join(outputRoot, "style-briefs", `${spec.id}-audit.json`);
  writeJsonAtomic(auditPath, audit);
  styleBriefs.push({fixtureId:spec.id,brief:asset(briefPath),audit:asset(auditPath),fingerprint:brief.fingerprint,primaryFamily:spec.family});
}
assert.equal(new Set(styleBriefs.map((item)=>item.fingerprint)).size,5,"smoke genres must not collapse into one template");
assert.equal(new Set(styleBriefs.map((item)=>item.primaryFamily)).size,5,"smoke genres must use five primary families");

const fullSourceHashes = [entryPath, fullSourcePath, path.join(root,"lib/a1-motion-ir-parity-v1.js")].map((file)=>({path:relative(file),sha256:fileSha256(file)}));
const smokeSourceHashes = [entryPath, smokeSourcePath].map((file)=>({path:relative(file),sha256:fileSha256(file)}));
const sourceHashes = [...new Map([...fullSourceHashes,...smokeSourceHashes].map((item)=>[item.path,item])).values()];
const fullCacheKey = sha256Json({contract:"A1SystemValidationWholeFilmCache/v1",board:boardReport.board.sha256,timeline:boardReport.timelineBoard.sha256,masters:boardReport.items.map(({shotId,artifactSha256})=>({shotId,artifactSha256})),sourceHashes:fullSourceHashes,inputPropsSha256:fileSha256(inputPropsPath)});
const smokeCacheKey = sha256Json({contract:"A1SystemValidationFiveGenreSmokeCache/v1",sourceHashes:smokeSourceHashes,fontSha,styleBriefFingerprints:styleBriefs.map((item)=>item.fingerprint)});
const alphaCacheKey=sha256Json({contract:"A1SystemValidationAlphaOverlayCache/v1",renderer:fileSha256(fullSourcePath),plans:alphaOverlayPlans.map(({shotId,durationInFrames,sourceKey})=>({shotId,durationInFrames,sourceKey}))});
const cacheKey = sha256Json({contract:"A1SystemValidationCandidateCache/v3",fullCacheKey,smokeCacheKey,alphaCacheKey});
const fullVideo = path.join(outputRoot, "whole-film-candidate-960x540.mp4");
const smokeVideo = path.join(outputRoot, "five-genre-smoke-960x540.mp4");
const cacheStatePath = path.join(outputRoot, "cache-state.json");
const previousCache = fs.existsSync(cacheStatePath) ? readJson(cacheStatePath) : null;
const previousReportPath = path.join(outputRoot,"report.json");
const previousReport = fs.existsSync(previousReportPath) ? readJson(previousReportPath) : null;
const validOutput = (file) => fs.existsSync(file) && previousCache?.outputs?.[path.basename(file)]?.sha256 === fileSha256(file);
const previousSources = previousReport?.source?.sourceHashes || [];
const previousSourceMatches = (items) => items.every((item)=>previousSources.some((prior)=>prior.path===item.path&&prior.sha256===item.sha256));
const migratedFullCacheValid = changedBeatIds.length===0 && previousReport?.source?.packageBoardSha256===boardReport.board.sha256 && previousReport?.source?.timelineBoardSha256===boardReport.timelineBoard.sha256 && previousSourceMatches(fullSourceHashes);
const validFullCache = validOutput(fullVideo) && (previousCache?.fullCacheKey===fullCacheKey || migratedFullCacheValid);
const validSmokeCache = validOutput(smokeVideo) && previousCache?.smokeCacheKey===smokeCacheKey;
const validAlphaCache=alphaOverlayPlans.every((plan)=>validOutput(plan.outputFile))&&previousCache?.alphaCacheKey===alphaCacheKey;
let renderCacheHit = validFullCache && validSmokeCache && validAlphaCache;
let renderDurationMs = 0;
const renderedTasks=[];
const incrementalPatchAllowed=!validFullCache&&validOutput(fullVideo)&&changedBeatIds.length>0&&changedBeatIds.length<=3&&changedBeatIds.every((shotId)=>beats.find((beat)=>beat.shotId===shotId)?.kind==="SCREEN_EVIDENCE");
if (!validFullCache || !validSmokeCache || !validAlphaCache) {
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser,renderMedia,selectComposition} = require("@remotion/renderer");
  const renderStarted = performance.now();
  const serveUrl = await bundle({entryPoint:entryPath,publicDir:renderPublicRoot,rootDir:rendererRoot,enableCaching:true});
  const browser = await openBrowser("chrome", {chromeMode:"headless-shell",logLevel:"warn"});
  try {
    if (!validFullCache) {
      const whole = await selectComposition({serveUrl,id:"A1SystemValidationWholeFilmCandidateV1",inputProps,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
      if (incrementalPatchAllowed) {
        for (const shotId of changedBeatIds) {
          const beat=beats.find((item)=>item.shotId===shotId);
          const patchVideo=path.join(outputRoot,`.${shotId}-corrected-segment.mp4`);
          const patchedFull=path.join(outputRoot,`.${shotId}-patched-full.mp4`);
          await renderMedia({serveUrl,composition:whole,inputProps,frameRange:[beat.startFrame,beat.endFrame-1],outputLocation:patchVideo,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:84,crf:24,concurrency:2,hardwareAcceleration:"if-possible",overwrite:true,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
          const start=(beat.startFrame/30).toFixed(6),end=(beat.endFrame/30).toFixed(6);
          const filter=`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[0:v]trim=start=${end},setpts=PTS-STARTPTS[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]`;
          run(ffmpeg,["-hide_banner","-loglevel","error","-y","-i",fullVideo,"-i",patchVideo,"-filter_complex",filter,"-map","[v]","-map","0:a?","-c:v","libx264","-preset","fast","-crf","23","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",patchedFull]);
          fs.renameSync(patchedFull,fullVideo);
          fs.rmSync(patchVideo,{force:true});
          renderedTasks.push(`whole-film-incremental:${shotId}`);
        }
      } else {
        await renderMedia({serveUrl,composition:whole,inputProps,frameRange:[0,inputProps.totalFrames-1],outputLocation:fullVideo,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:84,crf:24,concurrency:2,hardwareAcceleration:"if-possible",overwrite:true,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
        renderedTasks.push("whole-film");
      }
    }
    if (!validSmokeCache) {
      const smoke = await selectComposition({serveUrl,id:"A1SystemValidationFiveGenreSmokeV1",inputProps:{},puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
      await renderMedia({serveUrl,composition:smoke,inputProps:{},frameRange:[0,449],outputLocation:smokeVideo,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:88,crf:22,concurrency:2,hardwareAcceleration:"if-possible",overwrite:true,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
      renderedTasks.push("five-genre-smoke");
    }
    if(!validAlphaCache){
      for(const plan of alphaOverlayPlans){
        const alphaProps={contract:"A1SystemValidationPackageAlphaProps/v1",shotId:plan.shotId,durationInFrames:plan.durationInFrames,asset:{publicUrl:plan.sourcePublicUrl,sha256:plan.sourceSha256,width:1920,height:1080}};
        const alphaComposition=await selectComposition({serveUrl,id:"A1SystemValidationPackageAlphaV1",inputProps:alphaProps,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
        await renderMedia({serveUrl,composition:alphaComposition,inputProps:alphaProps,frameRange:[0,plan.durationInFrames-1],outputLocation:plan.outputFile,codec:"prores",proResProfile:"4444",pixelFormat:"yuva444p10le",imageFormat:"png",concurrency:2,muted:true,hardwareAcceleration:"disable",overwrite:true,puppeteerInstance:browser,logLevel:"warn",timeoutInMilliseconds:120000});
        renderedTasks.push(`alpha-overlay:${plan.shotId}`);
      }
    }
  } finally {
    await browser.close({silent:true});
  }
  renderDurationMs=Math.round(performance.now()-renderStarted);
}
const cacheOutputs={[path.basename(fullVideo)]:asset(fullVideo),[path.basename(smokeVideo)]:asset(smokeVideo)};
for(const plan of alphaOverlayPlans)cacheOutputs[path.basename(plan.outputFile)]=asset(plan.outputFile);
writeJsonAtomic(cacheStatePath,{contract:"A1SystemValidationCandidateCacheState/v3",status:"PASS",cacheKey,fullCacheKey,smokeCacheKey,alphaCacheKey,renderCacheHit,fullCacheHit:validFullCache,smokeCacheHit:validSmokeCache,alphaCacheHit:validAlphaCache,renderedTasks,maxConcurrency:2,renderDurationMs,outputs:cacheOutputs,generatedAt:new Date().toISOString()});

const alphaDeliveryByShot=new Map();
for(const plan of alphaOverlayPlans){
  const alphaProbe=probe(plan.outputFile);
  const stream=alphaProbe.streams.find((item)=>item.codec_type==="video");
  assert.equal(stream?.codec_name,"prores",`${plan.shotId} alpha codec`);
  assert.match(String(stream?.pix_fmt||""),/^yuva444p/u,`${plan.shotId} alpha pixel format`);
  const probeFrame=path.join(alphaOverlayRoot,`.${plan.shotId}-alpha-probe.png`);
  run(ffmpeg,["-hide_banner","-loglevel","error","-y","-ss","0.800","-i",plan.outputFile,"-frames:v","1",probeFrame]);
  const stats=await sharp(probeFrame).ensureAlpha().stats();
  fs.rmSync(probeFrame,{force:true});
  const alpha=stats.channels[3];
  assert.ok(alpha&&alpha.min===0&&alpha.max>0&&alpha.mean>0,`${plan.shotId} transparent and visible pixels required`);
  alphaDeliveryByShot.set(plan.shotId,{file:asset(plan.outputFile),sourcePng:asset(plan.sourceFile),probe:alphaProbe,alphaAudit:{min:alpha.min,max:alpha.max,mean:Number(alpha.mean.toFixed(3)),transparentAndVisiblePixelsPresent:true},format:"prores4444-yuva",containsBaseFootage:false,containsPresenterPixels:false,containsAudio:false,containsCaptions:false});
}

const clipsRoot = path.join(outputRoot,"insertion-clips");
fs.mkdirSync(clipsRoot,{recursive:true});
const insertionEntries=[];
for (const item of boardReport.items) {
  const beat=beats.find((entry)=>entry.shotId===item.shotId);
  const clipPath=path.join(clipsRoot,`${item.shotId}.mp4`);
  const clipCacheKey=sha256Json({fullCacheKey,shotId:item.shotId,startFrame:beat.startFrame,durationInFrames:beat.durationInFrames});
  const sidecar=path.join(clipsRoot,`${item.shotId}.json`);
  const prior=fs.existsSync(sidecar)?readJson(sidecar):null;
  if (!(prior?.cacheKey===clipCacheKey&&fs.existsSync(clipPath)&&prior.sha256===fileSha256(clipPath))) {
    const start=(beat.startFrame/30).toFixed(6);
    const duration=(beat.durationInFrames/30).toFixed(6);
    run(ffmpeg,["-hide_banner","-loglevel","error","-y","-ss",start,"-i",fullVideo,"-t",duration,"-c:v","libx264","-preset","fast","-crf","22","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart",clipPath]);
    writeJsonAtomic(sidecar,{contract:"A1SystemValidationClipCache/v1",cacheKey:clipCacheKey,sha256:fileSha256(clipPath)});
  }
  const clipProbe=probe(clipPath);
  const mode=item.presentationMode;
  const typographySpec=typographyByShot.get(item.shotId);
  assert.ok(typographySpec,`${item.shotId} typography coverage missing`);
  const alphaDelivery=alphaDeliveryByShot.get(item.shotId)||null;
  insertionEntries.push({
    shotId:item.shotId,
    startMs:Math.round(beat.startFrame/30*1000),
    endMs:Math.round(beat.endFrame/30*1000),
    durationMs:Math.round(beat.durationInFrames/30*1000),
    mode,
    file:asset(clipPath),
    dimensions:{width:960,height:540},
    fps:30,
    alpha:Boolean(alphaDelivery),
    background:alphaDelivery?"TRANSPARENT_PACKAGE_OVER_SOURCE_PRESENTER":"OPAQUE_INTEGRATED_COMPOSITE",
    editorOperation:alphaDelivery?"PLACE_PRORES4444_OVER_ORIGINAL_SOURCE_RANGE":"REPLACE_RANGE_WITH_COMPOSITE_CANDIDATE",
    deliverables:{opaqueComposite:{file:asset(clipPath),format:"h264-yuv420p",containsBaseFootage:true},alphaOverlay:alphaDelivery},
    selectedMaster:{publicUrl:item.artifactPublicUrl,sha256:item.artifactSha256},
    sourceBinding:{kind:item.sourceRole||"CURRENT_CANONICAL_LOOK_MASTER",actualPixels:true,presenterPixels:alphaDelivery?"EXCLUDED_BY_HASHED_INVERSE_PRESENTER_MATTE":"NOT_APPLICABLE"},
    typography:{specification:{publicUrl:publicUrl(typographyAuditPath),sha256:fileSha256(typographyAuditPath),selector:{shotId:item.shotId}},status:typographySpec.status,exactCopy:typographySpec.exactCopy,editableRenderReady:typographySpec.editableRenderReady,candidateEditableSpecReady:typographySpec.candidateEditableSpecReady,canonicalEditableLayerReady:typographySpec.canonicalEditableLayerReady,currentRenderedTextProvenance:typographySpec.currentRenderedTextProvenance,reconstructionFontBinding:typographySpec.reconstructionFontBinding||null,postApprovalRequirement:typographySpec.postApprovalRequirement},
    semanticMotion:{actorCount:beat.package.semanticRasterSlices?.length||1,actorIds:beat.package.motionIrScene.actors.map((actor)=>actor.id),semanticActorJobs:beat.package.motionIrScene.actors.map((actor)=>actor.semanticJob),rasterSliceCandidateOnly:Boolean(beat.package.semanticRasterSlices?.length)},
    cacheKey:clipCacheKey,
    probe:clipProbe,
    userVisualApproved:false,
    productionEligible:false,
  });
}

const makeContactSheet = async ({video,samples,columns,file}) => {
  const tempRoot=path.join(outputRoot,".frames",path.basename(file,".png"));
  fs.mkdirSync(tempRoot,{recursive:true});
  const tileWidth=320,tileHeight=180,labelHeight=32;
  const tiles=[];
  for (const [index,sample] of samples.entries()) {
    const frameFile=path.join(tempRoot,`${String(index).padStart(2,"0")}.png`);
    run(ffmpeg,["-hide_banner","-loglevel","error","-y","-ss",(sample.timeMs/1000).toFixed(3),"-i",video,"-frames:v","1",frameFile]);
    const label=Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101417"/><text x="12" y="22" font-family="monospace" font-size="15" fill="#d8ff68">${sample.label}</text></svg>`);
    tiles.push(await sharp(frameFile).resize(tileWidth,tileHeight,{fit:"fill"}).extend({top:labelHeight,bottom:0,left:0,right:0,background:"#101417"}).composite([{input:label,top:0,left:0}]).png().toBuffer());
  }
  const rows=Math.ceil(tiles.length/columns);
  await sharp({create:{width:columns*tileWidth,height:rows*(tileHeight+labelHeight),channels:4,background:"#101417"}}).composite(tiles.map((input,index)=>({input,left:index%columns*tileWidth,top:Math.floor(index/columns)*(tileHeight+labelHeight)}))).png().toFile(file);
  fs.rmSync(tempRoot,{recursive:true,force:true});
};
const representativeSheet=path.join(outputRoot,"representative-five-motion-contact-sheet.png");
await makeContactSheet({video:fullVideo,samples:representativeShotIds.flatMap((shotId)=>{const beat=beats.find((item)=>item.shotId===shotId);return [
  {label:`${shotId} ENTER`,timeMs:(beat.startFrame+Math.min(4,beat.durationInFrames*.05))/30*1000},
  {label:`${shotId} HOLD`,timeMs:(beat.startFrame+beat.durationInFrames*.55)/30*1000},
  {label:`${shotId} EXIT`,timeMs:(beat.endFrame-Math.min(4,beat.durationInFrames*.05))/30*1000},
];}),columns:3,file:representativeSheet});
const timelineSheet=path.join(outputRoot,"whole-film-34-beat-contact-sheet.png");
await makeContactSheet({video:fullVideo,samples:beats.map((beat)=>({label:`${beat.shotId} ${beat.kind}`,timeMs:(beat.startFrame+beat.durationInFrames*.55)/30*1000})),columns:5,file:timelineSheet});
const smokeSheet=path.join(outputRoot,"five-genre-smoke-contact-sheet.png");
await makeContactSheet({video:smokeVideo,samples:genreSpecs.map((spec,index)=>({label:spec.id,timeMs:(index*3+1.6)*1000})),columns:5,file:smokeSheet});

const manifestBody={contract:"A1SystemValidationInsertionManifest/v2",status:"CANDIDATE_ONLY",candidateLane:"SYSTEM_VALIDATION",sourceBoardSha256:boardReport.board.sha256,sourceTimelineBoardSha256:boardReport.timelineBoard.sha256,entryCount:insertionEntries.length,typographyCoverage:{specification:asset(typographyAuditPath),candidateEditableSpecReadyCount:typographyAudit.candidateEditableSpecReadyCount,canonicalEditableLayerReadyCount:typographyAudit.canonicalEditableLayerReadyCount,editableRenderReadyCount:typographyAudit.editableRenderReadyCount,postApprovalRebuildCount:typographyAudit.postApprovalRebuildCount},deliveryCoverage:{modeAware:true,opaqueReplacementCount:insertionEntries.filter((entry)=>!entry.alpha).length,alphaOverlayCount:insertionEntries.filter((entry)=>entry.alpha).length,alphaOverlayShotIds:insertionEntries.filter((entry)=>entry.alpha).map((entry)=>entry.shotId),transparentFormat:"prores4444-yuva"},semanticMotionCoverage:{representativeShotIds,minimumActorsPerRepresentative:Math.min(...insertionEntries.filter((entry)=>representativeShotIds.includes(entry.shotId)).map((entry)=>entry.semanticMotion.actorCount)),allRepresentativeShotsMultiActor:insertionEntries.filter((entry)=>representativeShotIds.includes(entry.shotId)).every((entry)=>entry.semanticMotion.actorCount>=3)},entries:insertionEntries,boundary:{userVisualApproval:"NOT_APPROVED",operatorWaivedIntermediateReview:true,productionEligible:false,resolveWritePerformed:false,finalRender:false,alphaOverlaysProduced:true,canonicalLayerExtractionPerformed:false,limitation:"mode-aware candidate deliverables are real; canonical editable layers and production admission remain gated by explicit user visual approval"}};
const manifest={...manifestBody,manifestSha256:sha256Json(manifestBody),generatedAt:new Date().toISOString()};
const manifestPath=path.join(outputRoot,"insertion-manifest.json");
writeJsonAtomic(manifestPath,manifest);

const afterAuthority={phaseSha256:fileSha256(phasePath),workspaceSha256:fileSha256(workspacePath)};
assert.deepEqual(afterAuthority,beforeAuthority,"system-validation lane must not mutate canonical phase/workspace");
const fullProbe=probe(fullVideo),smokeProbe=probe(smokeVideo);
assert.equal(fullProbe.streams.some((stream)=>stream.codec_type==="video"&&stream.width===960&&stream.height===540),true);
assert.equal(smokeProbe.streams.some((stream)=>stream.codec_type==="video"&&stream.width===960&&stream.height===540),true);
const completeness=[
  ["input-full-article-understanding","REAL_PASS",workspacePath],
  ["semantic-shot-routing","REAL_PASS",boardReportPath],
  ["research-routing","REAL_PASS",fourShotAuditPath],
  ["whole-film-packaging-direction","REAL_PASS",boardReportPath],
  ["look-master-selection","REAL_PASS",boardReportPath],
  ["server-audit-and-canonical-admission","REAL_PASS",fourShotAuditPath],
  ["whole-film-static-board","REAL_PASS",path.join(generatedRoot,"whole-film-static-board-v1/whole-film-package-board.png")],
  ["typography-specification-coverage","REAL_PASS",typographyAuditPath],
  ["candidate-editable-typography-spec-readiness","REAL_PASS",typographyAuditPath],
  ["canonical-editable-typography-layer-readiness","MISSING",typographyAuditPath],
  ["mode-aware-alpha-and-opaque-delivery","REAL_PASS",manifestPath],
  ["semantic-motion-plan","REAL_PASS",path.join(outputRoot,"input-props.json")],
  ["representative-motion","REAL_PASS",representativeSheet],
  ["whole-film-candidate-preview","REAL_PASS",fullVideo],
  ["insertion-metadata","REAL_PASS",manifestPath],
  ["cache-and-resume","REAL_PASS",cacheStatePath],
  ["browser-review","PARTIAL",path.join(root,"scripts/audit-system-validation-browser-v1.mjs")],
  ["final-user-approval","MISSING",phasePath],
].map(([id,status,evidencePath])=>({id,status,evidencePath:relative(evidencePath),evidenceExists:fs.existsSync(evidencePath),authorizedScope:!["canonical-editable-typography-layer-readiness","final-user-approval"].includes(id),blockedBy:["canonical-editable-typography-layer-readiness","final-user-approval"].includes(id)?"EXPLICIT_USER_VISUAL_APPROVAL":null}));
const matrixPath=path.join(outputRoot,"completeness-matrix.json");
writeJsonAtomic(matrixPath,{contract:"A1SystemValidationCompletenessMatrix/v1",status:"BROWSER_AND_ACTUAL_PIXEL_REVIEW_PENDING",items:completeness,boundary:{userVisualApproval:"NOT_APPROVED",candidateOnly:true}});

const reportBody={contract:"A1SystemValidationCandidateReport/v2",status:"PENDING_ACTUAL_PIXEL_AND_BROWSER_REVIEW",candidateLane:"SYSTEM_VALIDATION_CANDIDATE_ONLY",cacheKey,source:{packageBoardSha256:boardReport.board.sha256,timelineBoardSha256:boardReport.timelineBoard.sha256,fourShotHashes:expected.shots,sourceHashes},render:{renderCacheHit,renderDurationMs,maxConcurrency:2,imageGenCalls:0,renderPublic,fullVideo:{...asset(fullVideo),probe:fullProbe},smokeVideo:{...asset(smokeVideo),probe:smokeProbe},alphaOverlays:Object.fromEntries([...alphaDeliveryByShot.entries()]),representativeShotIds,representativeClips:insertionEntries.filter((entry)=>representativeShotIds.includes(entry.shotId)).map((entry)=>({shotId:entry.shotId,...entry.file})),semanticMotion:{minimumActorsPerRepresentative:manifest.semanticMotionCoverage.minimumActorsPerRepresentative,allRepresentativeShotsMultiActor:manifest.semanticMotionCoverage.allRepresentativeShotsMultiActor,actorCounts:Object.fromEntries(insertionEntries.filter((entry)=>representativeShotIds.includes(entry.shotId)).map((entry)=>[entry.shotId,entry.semanticMotion.actorCount]))},contactSheets:{representative:asset(representativeSheet),timeline:asset(timelineSheet),smoke:asset(smokeSheet)}},styleBriefs,typographyCoverage:asset(typographyAuditPath),typographySummary:manifest.typographyCoverage,deliveryCoverage:manifest.deliveryCoverage,insertionManifest:asset(manifestPath),completenessMatrix:asset(matrixPath),recovery:{runnerTest:"npm run test:system-validation-runner-v1",cacheState:asset(cacheStatePath),productionRenderCacheHit:renderCacheHit,maxConcurrency:2},authorityMutationAudit:{before:beforeAuthority,after:afterAuthority,mutated:false},actualVisualReview:{status:"PENDING",userReview:false},boundary:{userVisualApproval:"NOT_APPROVED",operatorWaivedIntermediateReview:true,productionEligible:false,assemblyCreated:false,layersExtracted:false,motionCanonicalized:false,resolveWritePerformed:false,finalRender:false,published:false}};
const report={...reportBody,reportSha256:sha256Json(reportBody),generatedAt:new Date().toISOString(),elapsedMs:Math.round(performance.now()-startedAt)};
const reportPath=path.join(outputRoot,"report.json");
writeJsonAtomic(reportPath,report);
writeJsonAtomic(path.join(outputRoot,"admission.json"),{contract:"A1SystemValidationCandidateAdmission/v1",status:"CANDIDATE_ONLY_PENDING_ACTUAL_PIXEL_REVIEW",atomicAdmission:true,reportPublicUrl:publicUrl(reportPath),reportSha256:report.reportSha256,userVisualApproval:"NOT_APPROVED",productionEligible:false});
console.log(JSON.stringify({status:report.status,reportPath,fullVideo:report.render.fullVideo,smokeVideo:report.render.smokeVideo,contactSheets:report.render.contactSheets,insertionEntries:manifest.entryCount,renderCacheHit,imageGenCalls:0,maxConcurrency:2,authorityMutated:false,elapsedMs:report.elapsedMs},null,2));
