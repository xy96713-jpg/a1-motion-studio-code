#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const manifests=[
  "work/typography-imagegen-comparison-v1/manifest.json",
  "work/typography-imagegen-role-comparison-v1/manifest.json",
  "work/typography-imagegen-six-shot-canary-v1/manifest.json",
];
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const read=(file)=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const normalize=(value)=>String(value||"").replace(/[\s\p{P}\p{S}]+/gu,"");
async function visualFingerprint(bytes){
  const {data,info}=await sharp(bytes).resize(32,18,{fit:"fill"}).flatten({background:"#111315"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const luma=(offset)=>(data[offset]*0.299+data[offset+1]*0.587+data[offset+2]*0.114)/255;
  let sum=0,contrast=0;
  const colors=new Map();
  const cells=[];
  for(let y=0;y<18;y++)for(let x=0;x<32;x++){
    const offset=(y*32+x)*3;
    const value=luma(offset);
    sum+=value;
    if(x<31)contrast+=Math.abs(value-luma(offset+3));
    if(y<17)contrast+=Math.abs(value-luma(offset+32*3));
    const bucket=`${Math.round(data[offset]/32)}:${Math.round(data[offset+1]/32)}:${Math.round(data[offset+2]/32)}`;
    colors.set(bucket,(colors.get(bucket)||0)+1);
  }
  for(let gy=0;gy<3;gy++)for(let gx=0;gx<3;gx++){
    let total=0,count=0;
    for(let y=gy*6;y<(gy+1)*6;y++)for(let x=gx*11;x<Math.min(32,(gx+1)*11);x++){total+=luma((y*32+x)*3);count++;}
    cells.push(Number((total/count).toFixed(3)));
  }
  return{layoutOccupancy:cells,materialTexture:Number((contrast/(32*18*2)).toFixed(4)),meanLuminance:Number((sum/(32*18)).toFixed(4)),primaryColorBucket:[...colors.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"unknown"};
}
const candidates=[];
for(const manifestPath of manifests){
  const manifest=read(manifestPath);
  const rows=[...(manifest.candidates||[]),...(manifest.items||[]),...(manifest.supplementalRoleSamples||[])];
  for(const row of rows){
    if(!row.file)continue;
    candidates.push({manifestPath,id:String(row.id||row.shot),file:row.file,declaredSha256:row.sha256||null,exactCopy:row.text||manifest.exactCopy?.headline||"",status:row.status||"REVIEW_ONLY",rejectedReason:row.rejectedReason||null});
  }
}

for(const candidate of candidates){
  const file=path.join(root,candidate.file);
  if(!fs.existsSync(file)){candidate.fileStatus="MISSING";continue;}
  const bytes=fs.readFileSync(file);
  candidate.actualSha256=sha(bytes);
  candidate.shaStatus=candidate.actualSha256===candidate.declaredSha256?"PASS":"MISMATCH";
  try{
    const meta=await sharp(bytes).metadata();
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let nonOpaque=0;
    for(let offset=3;offset<data.length;offset+=info.channels)if(data[offset]<250)nonOpaque++;
    candidate.pixelStatus="DECODED";
    candidate.size=[meta.width,meta.height];
    candidate.alphaStatus=nonOpaque>0?"HAS_TRANSPARENCY":"OPAQUE_NO_GLYPH_ALPHA";
    candidate.nonOpaquePixelRatio=Number((nonOpaque/(info.width*info.height)).toFixed(4));
    candidate.fingerprint=await visualFingerprint(bytes);
  }catch(error){candidate.pixelStatus="DECODE_FAILED";candidate.decodeError=String(error?.message||error);}
  candidate.characterAudit="NOT_RUN";
  candidate.realCarrierComposite="UNVERIFIED";
  candidate.smallScaleReview="UNVERIFIED";
  candidate.productionEligible=false;
}

function similarity(left,right){
  const a=left?.fingerprint,b=right?.fingerprint;
  if(!a||!b)return null;
  const layout=a.layoutOccupancy.reduce((sum,value,index)=>sum+Math.abs(value-b.layoutOccupancy[index]),0)/a.layoutOccupancy.length;
  const texture=Math.abs(a.materialTexture-b.materialTexture);
  const luminance=Math.abs(a.meanLuminance-b.meanLuminance);
  const color=a.primaryColorBucket===b.primaryColorBucket?1:0;
  return Number((1-Math.min(1,layout*1.8+texture*1.2+luminance*0.6+(1-color)*0.08)).toFixed(3));
}
const sameCopyNearLookPairs=[];
for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const left=candidates[i],right=candidates[j];
  if(!normalize(left.exactCopy)||normalize(left.exactCopy)!==normalize(right.exactCopy))continue;
  const score=similarity(left,right);
  if(score!==null&&score>=0.78)sameCopyNearLookPairs.push({left:left.file,right:right.file,exactCopy:left.exactCopy,similarity:score,status:"HUMAN_VISUAL_REVIEW_REQUIRED"});
}
const bySha=new Map();
for(const candidate of candidates.filter((item)=>item.actualSha256))bySha.set(candidate.actualSha256,[...(bySha.get(candidate.actualSha256)||[]),candidate]);
const exactShaDuplicateGroups=[...bySha]
  .filter(([,items])=>items.length>1).map(([artifactSha256,items])=>({artifactSha256,files:items.map((item)=>item.file)}));
const failures=[];
if(candidates.some((item)=>item.shaStatus!=="PASS"))failures.push("MISSING_OR_SHA_MISMATCH");
if(candidates.some((item)=>item.pixelStatus!=="DECODED"))failures.push("DECODE_FAILED");
if(candidates.some((item)=>item.alphaStatus!=="HAS_TRANSPARENCY"))failures.push("NO_TRANSPARENT_GLYPH_ASSETS_IN_LEGACY_SAMPLES");
if(candidates.some((item)=>item.status==="VISUAL_REJECTED"))failures.push("REJECTED_CANDIDATE_PRESENT");
if(sameCopyNearLookPairs.length)failures.push("SAME_COPY_NEAR_LOOK_REVIEW");
failures.push("CHARACTER_AND_COMPOSITE_QA_PENDING");
const report={contract:"A1TypographyGeneratedCandidateAudit/v1",status:"REVIEW_REQUIRED",manifestPaths:manifests,candidateCount:candidates.length,opaqueCount:candidates.filter((item)=>item.alphaStatus==="OPAQUE_NO_GLYPH_ALPHA").length,shaPassCount:candidates.filter((item)=>item.shaStatus==="PASS").length,rejectedCount:candidates.filter((item)=>item.status==="VISUAL_REJECTED").length,exactShaDuplicateGroups,sameCopyNearLookPairs,failures,candidates,acceptanceBoundary:{similarityHeuristicNotTasteApproval:true,characterOcrNotRun:true,actualOutputAndRealCarrierRequired:true,productionAdmission:false}};
const out=path.join(root,"work/typography-role-matrix-v1/reference-bound-pack-v1/generated-candidate-audit.json");
fs.writeFileSync(out,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,candidateCount:report.candidateCount,opaqueCount:report.opaqueCount,shaPassCount:report.shaPassCount,rejectedCount:report.rejectedCount,nearLookPairCount:report.sameCopyNearLookPairs.length,failures,reportPath:out},null,2));
