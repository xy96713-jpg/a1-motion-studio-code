#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,".."); const appRoot=path.join(root,"apps/studio-next");
const base="assets/a1-packaging/retro-pixel-generated-v1";
const candidateDefinitions=[
  {id:"overlay-element-pack-alpha-v1",file:"overlay-element-pack-alpha-v1.png",sha256:"b7be5bb8b3a979d1e8def45ae157519e7b90a0df9a50b9b45fe0348af4cbbb0d",role:"OVERLAY_ALPHA_ELEMENT_PACK",alphaRequired:true},
  {id:"fullscreen-verdict-background-v1",file:"fullscreen-verdict-background-v1.png",sha256:"687c34d2a1491f3029da1e37db56320e29cccdf88beac44de498a72926cea2fc",role:"FULLSCREEN_VERDICT_BACKGROUND",alphaRequired:false},
  {id:"fullscreen-workflow-background-v1",file:"fullscreen-workflow-background-v1.png",sha256:"785cb30025c6a989706b4f43d687233022097584db8fcb8a5e5397523402b835",role:"FULLSCREEN_WORKFLOW_BACKGROUND",alphaRequired:false},
  {id:"fullscreen-five-way-comparison-background-v1",file:"fullscreen-five-way-comparison-background-v1.png",sha256:"be2d627e2f2eb89a0d69ba4201b4e0775cafb131b3de13ab04f3a43db1409fb6",role:"FIVE_WAY_COMPARISON_BACKGROUND",alphaRequired:false},
  {id:"fullscreen-verified-evidence-stage-v1",file:"fullscreen-verified-evidence-stage-v1.png",sha256:"3ea1de0a9197699e7e6c08cda49db845024e4cee143244c138e0f25fa0b90dd6",role:"VERIFIED_EVIDENCE_STAGE_BACKGROUND",alphaRequired:false},
  {id:"fullscreen-three-problem-triptych-v1",file:"fullscreen-three-problem-triptych-v1.png",sha256:"2c47e31d33d3aca6320edd92d0fae6b055ced770a5fdb42c73a2b01753b8b443",role:"THREE_PROBLEM_TRIPTYCH_BACKGROUND",alphaRequired:false},
];
const hash=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value) || value instanceof Uint8Array ? value : typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const inspect=async (definition)=>{
  const absolute=path.join(appRoot,"public",base,definition.file); const bytes=fs.readFileSync(absolute); const actualSha256=hash(bytes);
  if(actualSha256!==definition.sha256) throw new Error(`candidate-sha-mismatch:${definition.id}`);
  const image=sharp(bytes,{animated:false}); const metadata=await image.metadata();
  if(metadata.width!==1672||metadata.height!==941||Boolean(metadata.hasAlpha)!==definition.alphaRequired) throw new Error(`candidate-pixel-format-invalid:${definition.id}`);
  let alphaStats={hasAlpha:Boolean(metadata.hasAlpha),alphaMin:null,alphaMax:null,transparentPixelCount:0};
  if(definition.alphaRequired){const raw=await image.ensureAlpha().raw().toBuffer(); let min=255,max=0,transparent=0; for(let i=3;i<raw.length;i+=4){const a=raw[i];min=Math.min(min,a);max=Math.max(max,a);if(a===0)transparent+=1;} if(min!==0||max!==255) throw new Error(`candidate-alpha-range-invalid:${definition.id}`); alphaStats={hasAlpha:true,alphaMin:min,alphaMax:max,transparentPixelCount:transparent};}
  return {contract:"A1PackagingReviewAssetCandidate/v1",id:definition.id,status:"REVIEW_ASSET_CANDIDATE",sourceKind:"IMAGEGEN_BITMAP_PRIMITIVE",primitiveRole:definition.role,assetPath:`/${base}/${definition.file}`,publicUrl:`/${base}/${definition.file}`,sha256:actualSha256,dimensions:{width:metadata.width,height:metadata.height},alpha:alphaStats,textPolicy:"TEXT_FREE_BITMAP_LOCAL_FUSION_PIXEL_TEXT_REQUIRED",pixelLineage:{containsPresenterPixels:false,containsBaseFootage:false,containsMicrophonePixels:false,containsBoomPixels:false,containsAudio:false,containsSubtitlePixels:false,forbiddenSourceKinds:["PRESENTER","BASE_VIDEO_HOLD_FRAME","MICROPHONE","BOOM","AUDIO","SUBTITLE","CAPTION"]},productionAdmissionAllowed:false,reviewOnly:true,requiredFutureComposition:definition.role === "OVERLAY_ALPHA_ELEMENT_PACK" ? "ALPHA_PACK_PLUS_FUSION_PIXEL_PATHS" : "OPAQUE_BACKGROUND_PLUS_FUSION_PIXEL_PATHS"};
};
const result=await withProjectLock(appRoot,async()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)); const candidates=await Promise.all(candidateDefinitions.map(inspect));
  const now=new Date().toISOString(); const body={contract:"A1PackagingReviewAssetCandidateSet/v1",status:"REVIEW_ASSET_CANDIDATE_ONLY",sourceWorkspaceSha256:current.workspaceSha256,candidates,productionAdmissionAllowed:false,writerExecutionAllowed:false,reviewOnly:true,sourceLineageVerified:true,notes:["ImageGen bitmaps remain review candidates until a separate actual-pixel/package review admission.","The chroma source is excluded; only the alpha pack is a candidate.","No visible Chinese text is baked into bitmap assets; Fusion Pixel paths remain local editable composition layers."],createdAt:now}; const manifest={...body,manifestSha256:hash(body)};
  const event=createProductionEvent({workspace:current,action:"register-retro-pixel-review-asset-candidates",targetId:"RETRO_PIXEL_GENERATED_V1",payload:{manifestSha256:manifest.manifestSha256,candidateCount:candidates.length,productionAdmissionAllowed:false,writerExecutionAllowed:false}});
  const next=structuredClone(current); next.production.packagingReviewAssetCandidates=manifest;
  const saved=persistProjectState(appRoot,recalculateEditorialAssetWorkbench(next,now),{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`register-retro-pixel-review-assets-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{"packaging-review-asset-candidates-v1/manifest.json":manifest}});
  return {...saved,manifest};
});
console.log(JSON.stringify({status:"PASS",candidateCount:result.manifest.candidates.length,manifestSha256:result.manifest.manifestSha256,workspaceSha256:result.workspaceSha256,transitionSha256:result.transitionSha256,productionAdmissionAllowed:false,writerExecutionAllowed:false,mediaGenerationPerformed:false},null,2));
