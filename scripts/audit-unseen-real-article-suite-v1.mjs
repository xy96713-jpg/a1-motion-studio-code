#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const registryPath=path.join(root,".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1/seen-source-hashes.json");
const artifactPath=path.join(root,".codex-artifacts/system-progress-system-line/unseen-real-article-suite-v1/report.json");
const publicPath=path.join(root,"apps/studio-next/public/generated/system-line/unseen-real-article-suite-v1/report.json");
const readJson=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const sha256=(file)=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);};

assert.ok(fs.existsSync(registryPath),"unseen article registry is required");
const registry=readJson(registryPath);
const accepted=[];
for(const entry of registry.entries||[]){
  const reportPath=path.resolve(root,entry.reportPath||"");
  if(!fs.existsSync(reportPath))continue;
  const report=readJson(reportPath);
  const route=report.route||(report.compilation?.route==="a1-codex-director"?"A1VisualDirectorProject/v1":"A1ArticleTemplateCompiler/v1");
  const reviewPath=path.resolve(root,report.directVisualReview?.reportPath||"");
  const review=fs.existsSync(reviewPath)?readJson(reviewPath):null;
  const mediaPath=report.render?.media?.path||"";
  const mediaExists=Boolean(mediaPath&&fs.existsSync(mediaPath));
  const mediaHashMatches=mediaExists&&sha256(mediaPath)===report.render.media.sha256&&report.render.media.sha256===entry.mediaSha256;
  const qualifies=report.status==="FULL_E2E_PASS"
    && route==="A1VisualDirectorProject/v1"
    && Number(report.compilation?.maxTemplateRun||Infinity)<=2
    && report.compilation?.exactCoverage===true
    && report.directVisualReview?.status==="DIRECT_VISUAL_REVIEW_PASS"
    && review?.browserPlayback?.status==="PASS"
    && Number(review?.browserPlayback?.readyState||0)>=3
    && mediaHashMatches;
  if(qualifies)accepted.push({
    title:entry.title,
    sourceSha256:entry.sourceSha256,
    route,
    shotCount:report.compilation.shotCount,
    acceptedSentenceCount:report.compilation.acceptedSentenceCount,
    maxTemplateRun:report.compilation.maxTemplateRun,
    templateFamilyCount:report.compilation.templateFamilyCount,
    durationSec:report.render.media.durationSec,
    mediaSha256:report.render.media.sha256,
    contactSheetSha256:report.contactSheet.sha256,
    browserPlayback:{status:review.browserPlayback.status,readyState:review.browserPlayback.readyState,durationSec:review.browserPlayback.durationSec},
    reportPath:path.relative(root,reportPath),
  });
}
const uniqueSources=new Set(accepted.map((entry)=>entry.sourceSha256));
assert.ok(accepted.length>=2,`at least two qualified current-director holdouts required, got ${accepted.length}`);
assert.equal(uniqueSources.size,accepted.length,"qualified holdouts must use unique source hashes");
const body={
  contract:"A1UnseenRealArticleSuite/v1",
  status:"PASS",
  requiredQualifiedHoldouts:2,
  qualifiedHoldoutCount:accepted.length,
  uniqueSourceCount:uniqueSources.size,
  route:"A1VisualDirectorProject/v1",
  checks:{fullE2E:true,exactCoverage:true,maxTemplateRunAtMostTwo:true,directVisualReview:true,browserPlayback:true,mediaHashBinding:true},
  entries:accepted,
  boundary:{provesCrossArticlePipelineRepeatability:true,userVisualApproval:"NOT_APPROVED",productionReleaseApproved:false},
};
const report={...body,reportSha256:createHash("sha256").update(JSON.stringify(body)).digest("hex"),generatedAt:new Date().toISOString()};
writeJson(artifactPath,report);writeJson(publicPath,report);
console.log(JSON.stringify({status:report.status,qualifiedHoldoutCount:report.qualifiedHoldoutCount,sourceHashes:accepted.map((entry)=>entry.sourceSha256),reportPath:path.relative(root,artifactPath),reportSha256:report.reportSha256},null,2));
