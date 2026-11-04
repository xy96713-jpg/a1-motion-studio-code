#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(import.meta.dirname,"..");
const reportFile=path.join(root,"work/typography-role-matrix-v1/reference-bound-pack-v1/generated-candidate-audit.json");
const source=JSON.parse(fs.readFileSync(reportFile,"utf8"));
const files=source.candidates.filter((item)=>item.pixelStatus==="DECODED").map((item)=>item.file);
const result=spawnSync("/usr/bin/swift",[path.join(root,"scripts/audit-typography-ocr-v1.swift"),...files],{cwd:root,encoding:"utf8",timeout:180000,maxBuffer:16*1024*1024});
if(result.error||result.status!==0)throw new Error(`typography-ocr-command-failed:${result.error?.message||result.stderr||result.status}`);
const recognized=JSON.parse(result.stdout);
const normalize=(value)=>String(value||"").replace(/[\s\p{P}\p{S}]+/gu,"");
const reviews=recognized.map((item)=>{
  const candidate=source.candidates.find((row)=>row.file===item.path);
  const observed=normalize(item.lines.map((line)=>line.text).join(""));
  const expected=normalize(candidate?.exactCopy);
  const status=item.status==="OCR_REVIEW_ONLY"&&expected&&observed.includes(expected)?"EXACT_COPY_OCR_MATCH":"OCR_SUSPECT_MANUAL_REVIEW";
  return{file:item.path,expectedCopy:candidate?.exactCopy||"",observedLines:item.lines,ocrStatus:status,knownVisualStatus:candidate?.status||null,productionAdmission:false};
});
const report={contract:"A1TypographyCandidateOcrReview/v1",status:"MANUAL_REVIEW_REQUIRED",candidateCount:reviews.length,exactCopyMatchCount:reviews.filter((item)=>item.ocrStatus==="EXACT_COPY_OCR_MATCH").length,suspectCount:reviews.filter((item)=>item.ocrStatus!=="EXACT_COPY_OCR_MATCH").length,reviews,boundary:{ocrMismatchIsSuspicionNotProofOfWrongGlyph:true,characterLevelActualPixelReviewRequired:true,productionAdmission:false}};
const out=path.join(root,"work/typography-role-matrix-v1/reference-bound-pack-v1/ocr-review.json");
fs.writeFileSync(out,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,candidateCount:report.candidateCount,exactCopyMatchCount:report.exactCopyMatchCount,suspectCount:report.suspectCount,reportPath:out},null,2));
