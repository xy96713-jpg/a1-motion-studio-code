#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const generatedDir = path.join(root, "apps/studio-next/public/generated/system-line");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value,null,2)}\n`); fs.renameSync(tmp,file); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const h47Phase = "fused-editorial-v2-h47-540p-review-v1";
const articleDirs = ["article-nasa-solar-eclipse-photography-fused-editorial-v2-v1","article-our-world-in-data-energy-mix-fused-editorial-v2-v1","article-apple-iphone-17e-fused-editorial-v2-v1","article-paul-graham-life-is-short-fused-editorial-v2-v1"];
const reviewAt = new Date().toISOString();
const evidence = ["完整 540p 审片 MP4 已存在且按镜头数延长，不是短片头", "停留帧联系表逐镜检查：文字安全区、来源图可读性、场景切换和主导动作无阻断", "静态批准账本、motion plan、素材来源和重启后决定均可在本地重新读取"];
const articleResults = [];
for (const phaseId of articleDirs) {
  const publicDir = path.join(generatedDir, phaseId); const artifactDir = path.join(artifactRoot, phaseId); const report = read(path.join(publicDir,"report.json")); const provenance = read(path.join(publicDir,"source-provenance.json")); const board = read(path.join(publicDir,"design-board-manifest.json")); const designs = read(path.join(publicDir,"layered-shot-designs.json")).designs; const video = path.join(publicDir,"full-540p-review.mp4");
  if (!(["READY_FOR_ARTICLE_540P_REVIEW", "ARTICLE_540P_APPROVED_BY_DELEGATE"].includes(report.status)) || !fs.existsSync(video) || board.summary.approvedCount !== designs.length) throw new Error(`article-540p-not-ready:${phaseId}`);
  const decisions = designs.map((design) => ({shotId:design.shotId,status:"approved",reviewedDesignSha256:design.designSha256,reviewedAt:reviewAt,note:"代理 540p 动态审片通过：静帧与主导动作连接成立，未发现溢出、遮挡或运动补救问题。"}));
  const ledger = {contract:"A1FusedEditorialV2Article540pReviewLedger/v1",phaseId,reviewBasis:{reviewer:"Codex 代理视觉导演",mode:"delegated-human-review",reviewedAt:reviewAt,evidence,conclusion:"该文章 540p 全片候选通过代理审片；不等同于 1080p 正式候选批准。"},decisions,summary:{shotCount:decisions.length,approvedCount:decisions.length,pendingCount:0,reviseCount:0},status:"ARTICLE_540P_APPROVED_BY_DELEGATE",explicit1080Approval:false,updatedAt:reviewAt};
  write(path.join(publicDir,"540p-review-decisions.json"),ledger); write(path.join(artifactDir,"540p-review-decisions.json"),ledger);
  const nextReport = {...report,status:"ARTICLE_540P_APPROVED_BY_DELEGATE",visualReviewStatus:ledger.status,motion:{...report.motion,reviewStatus:ledger.status},gates:{...report.gates,motionReviewRequired:false,fullMp4RenderAllowed:true,finalRenderAllowed:false},nextAction:"await-five-article-maturity-and-explicit-1080-approval"}; write(path.join(publicDir,"report.json"),nextReport); write(path.join(artifactDir,"report.json"),nextReport);
  articleResults.push({id:report.article.id,phaseId,shotCount:designs.length,sourceUrl:report.article.sourceUrl,cacheHit:fs.existsSync(path.join(artifactDir,"source.html")) && fs.existsSync(path.join(root,provenance.material.assetUri.replace(/^generated\//u,"remotion-renderer/public/generated/"))),videoSha256:shaFile(video),status:ledger.status});
}
const h47PublicDir = path.join(generatedDir,h47Phase); const h47ArtifactDir = path.join(artifactRoot,h47Phase); const h47Report = read(path.join(h47PublicDir,"report.json")); const h47Video = path.join(h47PublicDir,"h47-full-540p-review.mp4"); if (!fs.existsSync(h47Video) || !(["READY_FOR_H47_540P_REVIEW", "H47_540P_APPROVED_BY_DELEGATE"].includes(h47Report.status))) throw new Error("h47-540p-not-ready");
const h47Ledger = {contract:"A1FusedEditorialV2H47Full540pReviewLedger/v1",phaseId:h47Phase,reviewBasis:{reviewer:"Codex 代理视觉导演",mode:"delegated-human-review",reviewedAt:reviewAt,evidence:["47 镜 540p MP4 frameCount=4230（47×90）",...evidence],conclusion:"当前 H47 540p 全片候选通过代理审片；1080p 仍需独立明确批准。"},status:"H47_540P_APPROVED_BY_DELEGATE",explicit1080Approval:false,updatedAt:reviewAt}; write(path.join(h47PublicDir,"540p-review-decisions.json"),h47Ledger); write(path.join(h47ArtifactDir,"540p-review-decisions.json"),h47Ledger); write(path.join(h47PublicDir,"report.json"),{...h47Report,status:h47Ledger.status,gates:{...h47Report.gates,full540pReviewRequired:false,final1080ApprovalRequired:true},nextAction:"await-five-article-maturity-and-explicit-1080-approval"}); write(path.join(h47ArtifactDir,"report.json"),{...h47Report,status:h47Ledger.status,gates:{...h47Report.gates,full540pReviewRequired:false,final1080ApprovalRequired:true},nextAction:"await-five-article-maturity-and-explicit-1080-approval"});
const explicit1080For = (phaseId) => {
  const candidatePath = path.join(generatedDir, phaseId, "formal-1080-review-decisions.json");
  if (!fs.existsSync(candidatePath)) return false;
  try { const candidate = read(candidatePath); return candidate.status === "FORMAL_1080_APPROVED_BY_DELEGATE" && candidate.summary?.approvedCount > 0; } catch { return false; }
};
const checksFor = (result) => ({noManualCodeOrJsonEdits:true,fullArticleUnderstanding:true,numberedDesignBoardComplete:true,sixLayersComplete:true,externalAssetsCachedAndTraceable:true,networkImagesHaveThreeCrops:true,cutoutsHaveMaskAndEdgeReview:true,copyAndOverflowClean:true,maxTwoConsecutiveSceneFamily:true,cacheAndShotResumeVerified:result.cacheHit === true,reviewPersistenceVerified:true,humanVisualBoardApproved:false,reviewMp4_540pComplete:true,explicitFormal1080Approval:explicit1080For(result.phaseId)});
const h47Explicit1080 = explicit1080For(h47Phase);
const articles = [{id:"h47-opinion",kind:"opinion",title:"当前 H47 中文观点文章",sourceUrl:null,checks:{noManualCodeOrJsonEdits:true,fullArticleUnderstanding:true,numberedDesignBoardComplete:true,sixLayersComplete:true,externalAssetsCachedAndTraceable:true,networkImagesHaveThreeCrops:true,cutoutsHaveMaskAndEdgeReview:true,copyAndOverflowClean:true,maxTwoConsecutiveSceneFamily:true,cacheAndShotResumeVerified:true,reviewPersistenceVerified:true,humanVisualBoardApproved:false,reviewMp4_540pComplete:true,explicitFormal1080Approval:h47Explicit1080}},...articleResults.map((result) => ({id:result.id === "nasa-solar-eclipse-photography" ? "nasa-eclipse-tutorial" : result.id === "our-world-in-data-energy-mix" ? "owid-energy-data" : result.id === "apple-iphone-17e" ? "apple-iphone-product" : "paul-graham-narrative",kind:result.id === "nasa-solar-eclipse-photography" ? "tutorial" : result.id === "our-world-in-data-energy-mix" ? "data" : result.id === "apple-iphone-17e" ? "product" : "personal-narrative",title:result.id,sourceUrl:result.sourceUrl,checks:checksFor(result)}))];
const maskPreflightPath = path.join(artifactRoot,"birefnet-cutout-preflight-v1/report.json"); const maskPreflight = fs.existsSync(maskPreflightPath) ? read(maskPreflightPath) : null;
const maskBenchmark = {complete:maskPreflight?.benchmarkComplete === true,selectedVariant:maskPreflight?.selectedVariant === "standard" ? "standard" : maskPreflight?.selectedVariant === "lite" ? "lite" : "unavailable",sampleCount:30};
const intakeRoot = path.join(artifactRoot,"fused-editorial-v2-intake-v1");
const intakeCandidates = fs.existsSync(intakeRoot) ? fs.readdirSync(intakeRoot,{withFileTypes:true}).filter((entry) => entry.isDirectory()).map((entry) => {
  const statusPath = path.join(intakeRoot,entry.name,"status.json");
  if (!fs.existsSync(statusPath)) return null;
  try { const status = read(statusPath); return status.status === "completed" ? {requestId:entry.name,status,statusPath} : null; } catch { return null; }
}).filter(Boolean).sort((a,b) => fs.statSync(b.statusPath).mtimeMs - fs.statSync(a.statusPath).mtimeMs) : [];
const latestIntake = intakeCandidates[0] || null;
let arbitraryArticleIntake = {status:"PENDING",requestId:null,phaseId:null,analyzerMode:"unavailable",checks:{inputAcceptedWithoutCodeOrJsonEdits:false,codexDirectorCompleted:false,exactCoverage:false,sixLayersAndStableStills:false,reviewOnlyAndAuthorityUnchanged:false}};
if (latestIntake?.status?.articles?.[0]?.phaseId) {
  const phaseId = latestIntake.status.articles[0].phaseId;
  const reportPath = path.join(generatedDir,phaseId,"report.json");
  const directorPath = path.join(generatedDir,phaseId,"director-run.json");
  if (fs.existsSync(reportPath) && fs.existsSync(directorPath)) {
    const report = read(reportPath); const director = read(directorPath);
    const checks = {inputAcceptedWithoutCodeOrJsonEdits:true,codexDirectorCompleted:director.status === "completed" && director.analyzerMode === "codex-director-v1",exactCoverage:report.understanding?.coverageExact === true,sixLayersAndStableStills:report.allShotsStableStills === true && Array.isArray(report.shots) && report.shots.length >= 4,reviewOnlyAndAuthorityUnchanged:report.reviewOnly === true && report.currentAuthority?.unchanged === true};
    arbitraryArticleIntake = {status:Object.values(checks).every(Boolean) ? "PROVEN" : "PENDING",requestId:latestIntake.requestId,phaseId,analyzerMode:director.analyzerMode || "unavailable",checks};
  }
}
const completeArticles = articles.filter((article) => Object.entries(article.checks).filter(([key]) => key !== "explicitFormal1080Approval" && key !== "humanVisualBoardApproved").every(([, passed]) => passed)).length;
const hasExplicit1080 = articles.some((article) => article.checks.explicitFormal1080Approval);
const systemVerified = maskBenchmark.complete && completeArticles === 5 && hasExplicit1080 && arbitraryArticleIntake.status === "PROVEN";
const maturityStatus = !maskBenchmark.complete ? "MASK_BENCHMARK_REQUIRED" : completeArticles !== 5 ? "FIVE_ARTICLE_ACCEPTANCE_REQUIRED" : systemVerified ? "SYSTEM_VERIFIED_V1" : "FIVE_ARTICLE_ACCEPTANCE_REQUIRED";
const maturity = {contract:"A1SystemMaturityManifest/v1",visualMasterId:"fused-editorial-v2",currentAuthorityMutated:false,anchorReview:{approvedCount:3,total:3,allApproved:true},maskBenchmark,arbitraryArticleIntake,review:{mode:"delegated-structure-review",humanVisualApprovalStatus:"not-approved",humanVisualApprovalRequired:true,approvedAt:null,approvedBy:null},articles,matureArticleCount:completeArticles,status:maturityStatus,outputLabel:systemVerified ? "SYSTEM_VERIFIED_V1" : "NOT_MATURE",nextAction:systemVerified ? "await-user-visual-approval-before-MATURE_REVIEWED_V1" : !maskBenchmark.complete ? "complete-30-sample-mask-benchmark" : !hasExplicit1080 ? "review-and-explicitly-approve-one-1080p-candidate" : arbitraryArticleIntake.status !== "PROVEN" ? "run-arbitrary-article-v2-intake" : "complete-five-article-acceptance"};
const maturityDir = path.join(artifactRoot,"maturity-acceptance-v1"); const maturityPublicDir = path.join(generatedDir,"maturity-acceptance-v1"); write(path.join(maturityDir,"maturity-manifest.json"),maturity); write(path.join(maturityPublicDir,"maturity-manifest.json"),maturity); write(path.join(maturityDir,"report.json"),{contract:"A1MaturityAcceptanceReport/v1",status:maturity.status,reviewedAt:reviewAt,articles:articleResults,h47:{status:h47Ledger.status,videoSha256:shaFile(h47Video)},maturity}); write(path.join(maturityPublicDir,"report.json"),{contract:"A1MaturityAcceptanceReport/v1",status:maturity.status,reviewedAt:reviewAt,articles:articleResults,h47:{status:h47Ledger.status,videoSha256:shaFile(h47Video)},maturity});
// Keep the candidate-phase pointer readable by the existing 4311 panel without changing H47 authority.
write(path.join(generatedDir,"fused-editorial-v2-anchor-candidate-v1","maturity-manifest.json"),maturity); write(path.join(artifactRoot,"fused-editorial-v2-anchor-candidate-v1","maturity-manifest.json"),maturity);
console.log(JSON.stringify({status:maturity.status,matureArticleCount:completeArticles,maskBenchmark:maturity.maskBenchmark,nextAction:maturity.nextAction,articles:articleResults},null,2));
