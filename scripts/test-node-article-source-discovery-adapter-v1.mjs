#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileArticleSourceDiscoveryRequest,assertArticleSourceDiscoveryRequest,assertArticleSourceDiscoveryResult,discoverArticleSourceCandidates} from "../apps/studio-next/src/lib/a1-article-source-discovery-v1.mjs";
import {createArticleSourceDiscoveryNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-article-source-discovery-adapter-v1.mjs";
import {captureReviewedArticleSourcePageV1,recordReviewedArticleSourceSelectionV1,readReviewedArticleSourceCaptureV1,readReviewedArticleSourceSelectionV1} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {compileNodeWorkflow,summarizeNodeWorkflow} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {compileShotTaskWorkspaceV1} from "../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";

const sha=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const html=(rows)=>`<html><body><table>${rows.map(row=>`<tr><td><a class="result-link" rel="nofollow" href="${row.url}">${row.title}</a></td></tr><tr><td class="result-snippet">${row.snippet}</td></tr>`).join("")}</table></body></html>`;
const fixtures=[
  {id:"holdout-evidence-water",genre:"evidence-explainer",input:{articleTitle:"水资源报告来源",exactQuote:"城市耗水量下降 18%",entities:["水资源报告"],keywords:["water use report"]},expected:"water.example.org"},
  {id:"holdout-evidence-sleep",genre:"evidence-explainer",input:{articleTitle:"睡眠研究来源",exactQuote:"sleep duration and metabolic health",entities:["sleep study"],keywords:["cohort research"]},expected:"sleep.example.edu"},
  {id:"holdout-tutorial-backup",genre:"product-tutorial",input:{articleTitle:"备份操作手册",publisherHint:"Example Docs",keywords:["backup restore settings"]},expected:null},
  {id:"holdout-tutorial-camera",genre:"product-tutorial",input:{articleTitle:"相机备份页面",publisherHint:"Camera Support",keywords:["camera cloud backup"]},expected:"support.example.com"},
  {id:"holdout-opinion-meeting",genre:"personal-opinion",input:{articleTitle:"会议文化评论",exactQuote:"meetings became the work instead of helping the work",keywords:["meeting culture essay"]},expected:"essay.example.net"},
  {id:"holdout-opinion-reading",genre:"personal-opinion",input:{articleTitle:"阅读习惯评论",keywords:["reading habits personal essay"]},expected:null},
];
const rows=[];
for(const fixture of fixtures){
  const request=compileArticleSourceDiscoveryRequest({id:fixture.id,...fixture.input});assertArticleSourceDiscoveryRequest(request);
  let providerCalls=0;
  const result=await discoverArticleSourceCandidates(request,{fetchImpl:async url=>{
    providerCalls+=1;const query=new URL(url).searchParams.get("q")||"";let candidates=[];
    if(query.includes("水资源")||query.includes("water use"))candidates=[{url:"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwater.example.org%2Freport%3Futm_source%3Dindex",title:"City water-use report",snippet:"城市耗水量下降 18%，报告列出统计方法。"}];
    else if(query.includes("睡眠")||query.includes("sleep study"))candidates=[{url:"https://sleep.example.edu/research/metabolic-health",title:"Sleep duration and metabolic health",snippet:"sleep duration and metabolic health in a cohort research study"}];
    else if(query.includes("备份")||query.includes("backup restore"))candidates=[];
    else if(query.includes("相机")||query.includes("camera cloud"))candidates=[{url:"https://support.example.com/camera/cloud-backup",title:"Camera cloud backup support",snippet:"Configure camera cloud backup and restore settings."}];
    else if(query.includes("会议")||query.includes("meeting culture"))candidates=[
      {url:"https://essay.example.net/meetings",title:"The meeting culture essay",snippet:"meetings became the work instead of helping the work"},
      {url:"https://archive.example.org/meeting-notes",title:"Meeting notes and culture",snippet:"A discussion of meetings and work culture."},
    ];
    else if(query.includes("阅读")||query.includes("reading habits"))candidates=[{url:"http://127.0.0.1/private",title:"Private host",snippet:"reading habits essay"}];
    return new Response(html(candidates),{status:200,headers:{"content-type":"text/html; charset=UTF-8"}});
  }});
  assertArticleSourceDiscoveryResult(result,request);
  assert.ok(providerCalls<=3);
  if(fixture.expected){assert.ok(result.candidates.some(candidate=>new URL(candidate.url).hostname===fixture.expected),`${fixture.id}: expected host`);}
  else assert.equal(result.candidates.length,0,`${fixture.id}: no match remains explicit`);
  if(fixture.id==="holdout-evidence-water"){
    const candidate=result.candidates[0];assert.equal(candidate.excerptMatch.exactQuoteInSnippet,true);assert.equal(candidate.exactCopyVerified,false);assert.equal(candidate.status,"REVIEW_REQUIRED");
    assert.equal(new URL(candidate.url).searchParams.has("utm_source"),false);
  }
  if(fixture.id==="holdout-opinion-meeting"){
    assert.equal(result.candidates.length,2,"multiple hosts remain candidates; no automatic selection");
    assert.ok(result.candidates.every(candidate=>candidate.captureEligibleOnlyAfterReview));
  }
  rows.push({id:fixture.id,genre:fixture.genre,status:result.status,candidateCount:result.counts.candidateCount,providerCalls});
}

const primaryUrl="https://www.36kr.com/p/2872793466982535";
const quote="中国AI不可能永远处在跟随的位置，真实的gap是原创和模仿之差";
const seededRequest=compileArticleSourceDiscoveryRequest({id:"hupo-p49-seeded-primary-source",articleTitle:"揭秘DeepSeek:一个更极致的中国技术理想主义故事",
  publisherHint:"36氪 暗涌Waves",exactQuote:quote,entities:["梁文锋","DeepSeek"],keywords:["原创和模仿","中国AI跟随","技术前沿"],
  queryBasis:"VISIBLE_COPY_SEARCH_SEED",seedCandidates:[{url:primaryUrl,title:"揭秘DeepSeek:一个更极致的中国技术理想主义故事 ｜36氪独家",
    publisher:"36氪 / 暗涌Waves",relation:"EXACT_COPY_SOURCE",reviewNote:"Direct page verified during source research; quote/copy still requires page-capture lock and rights review."}]});
assertArticleSourceDiscoveryRequest(seededRequest);
let seededProviderCalls=0;
const seededResult=await discoverArticleSourceCandidates(seededRequest,{fetchImpl:async()=>{
  seededProviderCalls+=1;
  return new Response(html([{url:"https://mirror.example.org/liang-interview",title:"Liang interview copy",snippet:quote}]),
    {status:200,headers:{"content-type":"text/html; charset=UTF-8"}});
}});
assertArticleSourceDiscoveryResult(seededResult,seededRequest);
const resignResult=value=>{const {resultSha256,...body}=value;return {...body,resultSha256:sha(body)};};
const corruptSource=structuredClone(seededResult);corruptSource.candidates[0].title='modified';
assert.throws(()=>assertArticleSourceDiscoveryResult(corruptSource,seededRequest),/result-sha-invalid/u);
for(const mutate of [
  value=>{value.boundary.metadataOnly=false;},
  value=>{value.candidates[0].canonicalUrlVerified=true;},
  value=>{value.candidates[0].captureEligibleOnlyAfterReview=false;},
  value=>{value.candidates[0].excerptMatch.copyVerified=true;},
  value=>{value.candidates[0].rightsVerified=true;},
  value=>{value.counts.providerFailureCount+=1;},
  value=>{value.status='NO_RESULTS';},
  value=>{value.providerRuns[0].query='different query';},
]){
  const promoted=structuredClone(seededResult);mutate(promoted);
  assert.throws(()=>assertArticleSourceDiscoveryResult(resignResult(promoted),seededRequest));
}
assert.equal(seededResult.candidates[0].url,primaryUrl,"directly researched primary URL stays visible ahead of index mirrors");
assert.equal(seededResult.candidates[0].candidateOrigin,"RESEARCH_SEED");
assert.equal(seededResult.candidates[0].researchRelation,"EXACT_COPY_SOURCE");
assert.equal(seededResult.candidates[0].exactCopyVerified,false);
assert.equal(seededResult.candidates[0].articleBodyFetched,false);
assert.equal(seededResult.candidates[0].rightsVerified,false);
assert.equal(seededResult.boundary.automaticSourceSelection,false);
const privateSeedRequest=compileArticleSourceDiscoveryRequest({id:"private-seed",articleTitle:"Private page",
  seedCandidates:[{url:"http://127.0.0.1/article",title:"Private page",publisher:"local",relation:"FACTUAL_SOURCE_ONLY",reviewNote:"invalid"}]});
assert.equal(privateSeedRequest.status,"BLOCKED","private direct URL seeds fail closed");
for(const url of ['http://198.51.100.1/article','http://192.0.0.1/article','https://public.example.org:8443/article']){
  const unsafeRequest=compileArticleSourceDiscoveryRequest({id:'unsafe-seed',articleTitle:'Source page',seedCandidates:[{url,title:'Source page',publisher:'Publisher',relation:'FACTUAL_SOURCE_ONLY',reviewNote:''}]});
  assert.equal(unsafeRequest.status,'BLOCKED','discovery uses the existing central URL restrictions');
}
const frozenCases=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../fixtures/source-review-cases.json'),'utf8'));
const factualRequest=compileArticleSourceDiscoveryRequest({id:'frozen-factual-only',exactQuote:'A800 GPU',seedCandidates:[{url:frozenCases.cases[0].url,title:'A800 channel article',publisher:'CRN',relation:'FACTUAL_SOURCE_ONLY',reviewNote:frozenCases.cases[0].modelScope}]});
const factualResult=await discoverArticleSourceCandidates(factualRequest,{fetchImpl:async()=>new Response(html([]),{headers:{'content-type':'text/html'}})});
assertArticleSourceDiscoveryResult(factualResult,factualRequest);
assert.equal(factualResult.candidates[0].researchRelation,'FACTUAL_SOURCE_ONLY');
assert.equal(factualResult.candidates[0].exactCopyVerified,false);assert.equal(factualResult.candidates[0].rightsVerified,false);
assert.equal(factualResult.candidates[0].canonicalUrlVerified,false);assert.equal(factualResult.candidates[0].articleBodyFetched,false);

const unavailableRequest=compileArticleSourceDiscoveryRequest({id:"network-failure",articleTitle:"Source query",keywords:["public article source"]});
const unavailable=await discoverArticleSourceCandidates(unavailableRequest,{fetchImpl:async()=>{throw new Error("offline fixture");}});
assert.equal(unavailable.status,"PROVIDER_UNAVAILABLE");assert.equal(unavailable.boundary.articleBodyFetched,false);
assert.ok(unavailable.providerRuns.every(run=>run.reason==='PUBLIC_INDEX_NETWORK_UNAVAILABLE'));
const timedOut=await discoverArticleSourceCandidates(unavailableRequest,{fetchImpl:async()=>{throw Object.assign(new Error('sensitive timeout detail'),{name:'TimeoutError'});}});
assert.ok(timedOut.providerRuns.every(run=>run.reason==='PUBLIC_INDEX_TIMEOUT'));
const denied=await discoverArticleSourceCandidates(unavailableRequest,{fetchImpl:async()=>new Response('denied',{status:403})});
assert.ok(denied.providerRuns.every(run=>run.reason==='PUBLIC_INDEX_HTTP_403'));
const wrongType=await discoverArticleSourceCandidates(unavailableRequest,{fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json'}})});
assert.ok(wrongType.providerRuns.every(run=>run.reason==='PUBLIC_INDEX_CONTENT_TYPE_INVALID'));
const blockedRequest=compileArticleSourceDiscoveryRequest({id:"empty"});assert.equal(blockedRequest.status,"BLOCKED");

const receiptRoot=fs.realpathSync(fs.mkdtempSync(path.join(path.resolve(import.meta.dirname,"../work/hupo-69-shot-reconstruction-v1"),".a1-article-source-receipt-")));
try{
  const request=compileArticleSourceDiscoveryRequest({id:"adapter-fixture",articleTitle:"Water report",exactQuote:"water use fell 18 percent",keywords:["water report"]});
  const plan={contract:"A1ShotTaskPlan/v1",projectId:"article-source-plan-fixture",title:"Article source route fixture",scope:"RESEARCH_ONLY",productionAdmission:false,
    source:{videoSha256:sha("video")},shots:[{id:"shot-1",sourceText:"Find the source article for this locked line.",visualJob:"article-source discovery",exactCopy:[request.exactQuote],
      tasks:[{module:"article-source-discovery",dependencies:[],parameters:{request}}]}]};
  const taskWorkspace=compileShotTaskWorkspaceV1(plan),taskShot=taskWorkspace.production.shotIntelligence.currentStoryboardAuthority.shots[0];
  assert.equal(taskShot.nodeWorkflow.modules["article-source-discovery"],true);
  assert.equal(taskShot.nodeWorkflow.moduleInputs["article-source-discovery"].request.requestSha256,request.requestSha256);
  const registry=createNodeAdapterRegistry();assert.equal(registry.registry["article-source-discovery"].available,true);
  const adapter=createArticleSourceDiscoveryNodeAdapterV1({discover:async()=>discoverArticleSourceCandidates(request,{fetchImpl:async()=>new Response(html([{url:"https://water.example.org/article",title:"Water report",snippet:"water use fell 18 percent"}]),{status:200,headers:{"content-type":"text/html"}})})});
  const node={id:"shot-1:article-source-discovery",shotId:"shot-1",module:"article-source-discovery",inputSha256:sha("node-input"),state:"queued",input:{need:true,moduleVersion:1,parameters:{request}}};
  const result=await adapter.execute(node,{artifactRoot:receiptRoot});
  assert.equal(result.state,"needs-review");assert.equal(result.sourceSelected,false);assert.equal(result.mediaDownloaded,false);assert.equal(result.productionAdmission,false);
  assert.ok(fs.existsSync(path.join(receiptRoot,result.artifactManifest.artifacts[0].path)));
  const taskWorkflow=compileNodeWorkflow({projectId:"article-source-summary-fixture",workspaceSha256:sha("workspace"),shots:[{id:"shot-1",source:"find source page",modules:{"article-source-discovery":true},moduleInputs:{"article-source-discovery":{request}}}]},null,{moduleDefinitions:registry.definitions});
  const sourceNode=taskWorkflow.nodes.find(item=>item.module==="article-source-discovery");sourceNode.state=result.state;sourceNode.result=result;
  const projected=summarizeNodeWorkflow(taskWorkflow).nodes.find(item=>item.module==="article-source-discovery");
  assert.equal(projected.articleSourceDiscovery.status,"CANDIDATES_FOUND");
  assert.equal(projected.articleSourceDiscovery.candidates[0].url,"https://water.example.org/article");
  assert.equal(projected.articleSourceDiscovery.candidates[0].exactCopyVerified,false);
  const reviewNode={...node,state:"needs-review",result};
  const planSha=sha("current-plan");
  assert.throws(()=>recordReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",node:reviewNode,candidateId:result.articleSourceDiscovery.candidates[0].id,
    expectedPlanSha256:sha("stale-plan"),currentPlanSha256:planSha}),/PLAN_STALE/u);
  assert.throws(()=>recordReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",node:reviewNode,candidateId:"0".repeat(24),
    expectedPlanSha256:planSha,currentPlanSha256:planSha}),/CANDIDATE_INVALID/u);
  const neverSelectedNode={...reviewNode,id:"shot-2:article-source-discovery",shotId:"shot-2",inputSha256:sha("shot-2-node-input")};
  await assert.rejects(captureReviewedArticleSourcePageV1({repoRoot:path.resolve(import.meta.dirname,".."),taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",
    node:neverSelectedNode,candidateId:result.articleSourceDiscovery.candidates[0].id,selectionReceiptSha256:sha("no-selection"),expectedPlanSha256:planSha,currentPlanSha256:planSha,
    inspectTarget:async()=>{throw new Error("must-not-resolve-network");},capturePage:async()=>{throw new Error("must-not-capture-page");}}),/SELECTION_STALE/u);
  const selection=recordReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",node:reviewNode,candidateId:result.articleSourceDiscovery.candidates[0].id,
    expectedPlanSha256:planSha,currentPlanSha256:planSha,now:()=>"2026-09-29T12:00:00.000Z"});
  assert.equal(selection.status,"SELECTED_FOR_CAPTURE_REVIEW");assert.equal(selection.boundaries.pageFetched,false);assert.equal(selection.boundaries.mediaDownloaded,false);
  const savedSelection=readReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,shotId:"shot-1",nodeInputSha256:node.inputSha256});
  assert.equal(savedSelection.candidate.url,"https://water.example.org/article");assert.equal(savedSelection.boundaries.sourceIdentityLocked,false);
  assert.equal(readReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,shotId:"shot-1",nodeInputSha256:sha("changed-node")}),null,"stale node selection is not current");
  const storedReceipt=JSON.parse(fs.readFileSync(path.join(receiptRoot,selection.receipt.path),"utf8"));
  assert.equal(storedReceipt.captureHandoff.contract,"A1ArticlePageCaptureRequest/v1");assert.equal(storedReceipt.captureHandoff.status,"READY_FOR_EXPLICIT_PAGE_CAPTURE");
  assert.equal(storedReceipt.boundaries.articleBodyFetched,false);assert.equal(storedReceipt.boundaries.rightsVerified,false);assert.equal(storedReceipt.boundaries.productionAdmission,false);
  let captureCalls=0,networkChecks=0;
  const capturePlanSha=sha("plan-after-unrelated-shot-edit");
  const captureArgs={repoRoot:path.resolve(import.meta.dirname,".."),taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",node:reviewNode,
    candidateId:result.articleSourceDiscovery.candidates[0].id,selectionReceiptSha256:selection.receipt.sha256,expectedPlanSha256:capturePlanSha,currentPlanSha256:capturePlanSha,
    inspectTarget:async url=>{networkChecks+=1;if(url!=="https://water.example.org/article")throw new Error("unexpected-url");return {url};},
    capturePage:async({url,outputDirectory})=>{captureCalls+=1;const quote=request.exactQuote;fs.mkdirSync(outputDirectory,{recursive:true});
      fs.writeFileSync(path.join(outputDirectory,"readability-text.txt"),`A local review fixture contains ${quote} in the captured article body.\n`);
      fs.writeFileSync(path.join(outputDirectory,"page-screenshot.png"),Buffer.from("fixture-png-bytes"));
      fs.writeFileSync(path.join(outputDirectory,"source.json"),JSON.stringify({contract:"A1ArticlePageSource/v1",sourceUrl:url,targetUrl:url,title:"Water report",capturePolicy:{mode:"PUBLIC_ARTICLE_SOURCE_ONLY",remoteMediaRequestsBlocked:true,mediaDownloaded:false}}));
    }};
  await assert.rejects(captureReviewedArticleSourcePageV1({...captureArgs,inspectTarget:async()=>{throw new Error("PUBLIC_URL_DNS_NOT_PUBLIC");}}),/PUBLIC_URL_DNS_NOT_PUBLIC/u);
  assert.equal(captureCalls,0,"unresolved/private DNS never reaches the page-capture worker");
  const captured=await captureReviewedArticleSourcePageV1(captureArgs);
  assert.equal(captured.status,"SOURCE_COPY_LOCKED");assert.equal(captured.boundaries.exactCopyVerified,true);assert.equal(captured.boundaries.sourceIdentityLocked,true);
  assert.equal(captured.inputPlanSha256,capturePlanSha,"an unrelated plan edit does not invalidate a selection with the same source-node input SHA");
  assert.equal(captured.capturePolicy.imagesAndVideosFetched,false);assert.equal(captured.capturePolicy.mediaDownloaded,false);assert.equal(captured.boundaries.rightsVerified,false);assert.equal(captured.boundaries.productionAdmission,false);
  const savedCapture=readReviewedArticleSourceCaptureV1({taskRoot:receiptRoot,shotId:"shot-1",nodeInputSha256:node.inputSha256,selectionReceiptSha256:selection.receipt.sha256});
  assert.equal(savedCapture.source.body.sha256,captured.source.body.sha256);assert.ok(savedCapture.sourceLock.resolution.sourceEvidenceResolved);
  const cachedCapture=await captureReviewedArticleSourcePageV1(captureArgs);assert.equal(captureCalls,1,"same selection reuses its immutable capture receipt");assert.equal(networkChecks,1);
  const changedCandidatesFile=path.join(receiptRoot,result.artifactManifest.artifacts[0].path);fs.appendFileSync(changedCandidatesFile," ");
  assert.throws(()=>recordReviewedArticleSourceSelectionV1({taskRoot:receiptRoot,artifactRoot:receiptRoot,taskId:"article-source-plan-fixture",node:reviewNode,candidateId:result.articleSourceDiscovery.candidates[0].id,
    expectedPlanSha256:planSha,currentPlanSha256:planSha}),/RECEIPT_SHA_MISMATCH/u);
}finally{fs.rmSync(receiptRoot,{recursive:true,force:true});}

assert.equal(new Set(rows.map(row=>row.genre)).size,3);
console.log(JSON.stringify({contract:"A1ArticleSourceDiscoveryAdapterTest/v1",status:"PASS",fixtureCount:rows.length,genreCount:new Set(rows.map(row=>row.genre)).size,fixtures:rows,checks:{noResultsPreserved:true,privateCandidateRejected:true,ambiguousHostsNotSelected:true,articleBodyNotFetchedBeforeExplicitCapture:true,mediaDownloadFalse:true,sourceCaptureRequiresHumanChoice:true,selectionBoundToPlanNodeCandidateAndReceiptSha:true,staleSelectionIgnored:true,dnsFailurePreventsCapture:true,exactCopyCreatesCopyOnlySourceLock:true,directResearchSeedVisibleButUnverified:true,privateDirectResearchSeedRejected:true,rightsAndProductionAdmissionRemainFalse:true,reSignedPromotionRejected:true,providerFailureClassification:true,centralUrlRestrictionsUsed:true,factualSourceNotPromotedToCopyOrReuse:true}},null,2));
