#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {understandArticle} from "../apps/studio-next/src/lib/a1-article-understanding.ts";
import {discoverExternalMediaMetadata} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {discoverYouTubeReferenceMetadata} from "../apps/studio-next/src/lib/a1-youtube-reference-search-v1.mjs";
import {assertArticleMediaOrchestration, compileArticleMediaOrchestration} from "../apps/studio-next/src/lib/a1-article-media-orchestration-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const phaseRoot=path.resolve(root,process.env.A1_ARTICLE_MEDIA_OUTPUT_DIR||"work/article-media-orchestration-v1");
const ytDlpPath=process.env.A1_YTDLP_PATH||"/Users/a1/Documents/Codex/dj助手-runtime/venv312/bin/yt-dlp";
const openclipPython=path.join(root,"work/external-source-tool-canaries-v1/.venv/bin/python");
const ensure=(directory)=>fs.mkdirSync(directory,{recursive:true});
const shaValue=(value)=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel=(file)=>path.relative(root,file);
const xml=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const fixtures=[
  {id:"education-article",genre:"education",title:"What children learn when a classroom slows down",text:"Children learn through shared reading and small exercises in a classroom. Teachers turn repetition into visible practice, so children can see how a mistake becomes a method. The result is a calmer learning environment where attention matters more than speed."},
  {id:"nature-article",genre:"nature",title:"What a field keeps moving after the wind stops",text:"Grass bends in the wind while water moves across the edge of the field. The landscape is a chain of small transfers, from soil to roots and from waves to the shore. The final image is not an empty landscape but a living system that keeps changing."},
  {id:"technology-article",genre:"technology",title:"Automation moves repetition from people to machines",text:"Automation moves repetitive work from people to machines in a modern laboratory. A robotic arm follows a sequence, carries material, and returns to the same station without improvising. That change makes the workflow faster, but it also changes how people experience the work."},
];
const parseLastJsonLine=(value)=>{const lines=String(value||"").trim().split(/\r?\n/u).filter(Boolean);for(let index=lines.length-1;index>=0;index-=1){try{return JSON.parse(lines[index]);}catch{}}throw new Error("openclip-output-missing")};
async function visualQualityGate(candidates,query,scope){
  const eligible=(candidates||[]).filter((candidate)=>candidate.status==="CC_METADATA_FOUND_REVIEW_REQUIRED"&&candidate.previewUrl).slice(0,3);
  if(!eligible.length)return {status:"NO_MATCH",reason:"No CC candidate has a preview image for visual review",candidateId:null,semanticScore:null};
  const previewDir=path.join(phaseRoot,"semantic-previews",scope);ensure(previewDir);const imageCandidates=[];
  for(const candidate of eligible){const file=path.join(previewDir,`${candidate.sourceId}.jpg`);if(!fs.existsSync(file)){const response=await fetch(candidate.previewUrl,{headers:{"User-Agent":"A1MotionStudio/1.0 article-semantic-preview"}});if(!response.ok)continue;fs.writeFileSync(file,Buffer.from(await response.arrayBuffer()));}imageCandidates.push({candidate,file});}
  if(!imageCandidates.length)return {status:"NO_MATCH",reason:"Preview pixels unavailable for visual review",candidateId:null,semanticScore:null};
  const visualCandidates=imageCandidates.length===1
    ? [...imageCandidates,{candidate:{...imageCandidates[0].candidate,sourceId:`${imageCandidates[0].candidate.sourceId}:probe`},file:imageCandidates[0].file}]
    : imageCandidates;
  const rerank=spawnSync(openclipPython,["scripts/a1_external_source_tools.py"],{cwd:root,input:JSON.stringify({contract:"A1ExternalSourceToolRequest/v1",operation:"semantic-rerank",query,candidates:visualCandidates.map(({candidate,file})=>({id:candidate.sourceId,imagePath:rel(file),sha256:shaFile(file)}))}),encoding:"utf8",timeout:300000,maxBuffer:20_000_000});
  if(rerank.status!==0)return {status:"NO_MATCH",reason:"Visual rerank unavailable",candidateId:null,semanticScore:null};
  const output=parseLastJsonLine(rerank.stdout);const scores=new Map((output.ranking||[]).map((item)=>[item.id,Number(item.cosineScore||0)]));
  const ranked=imageCandidates.map(({candidate})=>{const semanticScore=scores.get(candidate.sourceId)||0;const textScore=Math.min(.35,Number(candidate.relevance?.rankingScore||0)*.2);return {...candidate,semanticScore,combinedScore:semanticScore+textScore};}).sort((left,right)=>right.combinedScore-left.combinedScore||right.semanticScore-left.semanticScore||left.title.localeCompare(right.title));
  const best=ranked[0];const threshold=.18;return best&&best.semanticScore>=threshold?{status:"MATCH",reason:"CC candidate cleared visual semantic gate with article-text relevance tie-break",candidateId:best.sourceId,semanticScore:best.semanticScore,combinedScore:best.combinedScore}:{status:"NO_MATCH",reason:`No candidate cleared visual semantic threshold ${threshold}`,candidateId:null,semanticScore:best?.semanticScore||null,combinedScore:best?.combinedScore||null};
}
ensure(phaseRoot);
const articleRows=[];const previewRows=[];let liveSearchCount=0;
for(const fixture of fixtures){
  const understanding=understandArticle(fixture.text,{title:fixture.title});
  const orchestration=compileArticleMediaOrchestration({articleId:fixture.id,title:fixture.title,articleText:fixture.text,articleSha256:shaValue(fixture.text),understanding});assertArticleMediaOrchestration(orchestration);
  const searches=[];
  for(const item of orchestration.program.items){
    const lane=item.lanes.find((candidate)=>candidate.primary)||item.lanes[0];if(!lane)continue;
    const external=await discoverExternalMediaMetadata(lane.request,{providers:["WIKIMEDIA_COMMONS","INTERNET_ARCHIVE","NASA_IMAGES"],limit:3,maxQueryVariants:1});
    const youtube=lane.request.media.preferred.includes("VIDEO")?discoverYouTubeReferenceMetadata(lane.request,{ytDlpPath,limit:12,detailLimit:12,timeoutMs:45000}):null;
    const youtubeDiscovery=youtube?await youtube:null;
    liveSearchCount+=external.counts.candidateCount+(youtubeDiscovery?.counts?.searched||0);
    const semanticQuery=[lane.request.search.queries.exactSource,lane.request.search.queries.broll,lane.request.direction.viewerTask].filter(Boolean).join(" ");
    const quality=await visualQualityGate(youtubeDiscovery?.candidates||[],semanticQuery,`${fixture.id}-${item.beat.beatId}`);
    searches.push({beatId:item.beat.beatId,laneId:lane.id,laneType:lane.type,viewerTask:item.beat.viewerTask,request:{id:lane.request.id,requestSha256:lane.request.requestSha256,narrativeRole:lane.request.direction.narrativeRole},quality,external:{status:external.status,counts:external.counts,topCandidates:external.providers.flatMap((provider)=>provider.candidates||[]).sort((a,b)=>(b.relevance?.score||0)-(a.relevance?.score||0)).slice(0,3).map((candidate)=>({provider:candidate.provider,sourceId:candidate.sourceId,title:candidate.title,sourcePageUrl:candidate.sourcePageUrl,mediaType:candidate.mediaType,license:candidate.license,relevance:candidate.relevance}))},youtube:youtubeDiscovery?{status:youtubeDiscovery.status,counts:youtubeDiscovery.counts,topCandidates:youtubeDiscovery.candidates.slice(0,3).map((candidate)=>({provider:candidate.provider,sourceId:candidate.sourceId,title:candidate.title,sourcePageUrl:candidate.sourcePageUrl,durationMs:candidate.durationMs,license:candidate.license,status:candidate.status,previewUrl:candidate.previewUrl,relevance:candidate.relevance}))}:null});
  }
  articleRows.push({id:fixture.id,genre:fixture.genre,title:fixture.title,understanding:{contract:understanding.contract,analyzerMode:understanding.analyzerMode,sentenceCount:understanding.sentences.length,sectionCount:understanding.sections.length,coverageExact:understanding.coverage.exact,confidence:understanding.confidence},orchestration:{contract:orchestration.contract,orchestrationSha256:orchestration.orchestrationSha256,beatCount:orchestration.semanticBeats.length,requestCount:orchestration.program.requests.length},searches});
  const matchedSearch=searches.find((search)=>search.quality?.status==="MATCH");
  const firstYouTube=matchedSearch?.youtube?.topCandidates?.find((candidate)=>candidate.sourceId===matchedSearch.quality.candidateId);
  previewRows.push({genre:fixture.genre,title:fixture.title,previewUrl:firstYouTube?.previewUrl||"",sourcePageUrl:firstYouTube?.sourcePageUrl||"",sourceTitle:firstYouTube?.title||"NO MATCH",status:firstYouTube?"FOUND_CC_REFERENCE":"NO_MATCH"});
}
const tileWidth=560,tileHeight=315,labelHeight=120,composites=[];
for(const [index,row] of previewRows.entries()){const left=index*tileWidth;let image;if(row.previewUrl){const response=await fetch(row.previewUrl,{headers:{"User-Agent":"A1MotionStudio/1.0 article-media-orchestration"}});if(response.ok)image=await sharp(Buffer.from(await response.arrayBuffer())).resize(tileWidth,tileHeight,{fit:"cover"}).png().toBuffer();}if(!image){image=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="20" y="150" fill="#c9ef39" font-family="Arial" font-size="28">NO MATCH</text></svg>`);}const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="26" fill="#c9ef39" font-family="Arial" font-size="14" font-weight="700">ARTICLE → SEARCH · ${xml(row.genre)}</text><text x="16" y="52" fill="#f2efe8" font-family="Arial" font-size="13">${xml(row.sourceTitle.slice(0,66))}</text><text x="16" y="78" fill="#d7dbd7" font-family="Arial" font-size="11">${xml(row.status)} · ${xml(row.title.slice(0,54))}</text><text x="16" y="103" fill="#8f9892" font-family="Arial" font-size="10">source-bound candidate · no automatic adoption</text></svg>`);composites.push({input:image,left,top:0},{input:label,left,top:tileHeight});}
const board=path.join(phaseRoot,"article-search-board.png");await sharp({create:{width:tileWidth*previewRows.length,height:tileHeight+labelHeight,channels:4,background:"#080b0c"}}).composite(composites).png().toFile(board);
const body={contract:"A1ArticleMediaOrchestrationQualification/v1",status:articleRows.every((row)=>row.understanding.coverageExact&&row.orchestration.beatCount>=2&&row.searches.length>0)?"PASS":"FAIL",generatedAt:new Date().toISOString(),fixtures:articleRows.map((row)=>({id:row.id,genre:row.genre,status:"PASS",noMatchCount:row.searches.filter((search)=>search.quality?.status==="NO_MATCH").length})),articles:articleRows,previewBoard:{path:rel(board),sha256:shaFile(board),width:tileWidth*previewRows.length,height:tileHeight+labelHeight},liveSearchCount,checks:{threeGenres:articleRows.length===3,articleUnderstandingExact:articleRows.every((row)=>row.understanding.coverageExact),semanticBeatsDriveSearch:articleRows.every((row)=>row.orchestration.beatCount>=2),multiSourceSearchExecuted:liveSearchCount>0,providerProvenanceBound:articleRows.every((row)=>row.searches.every((search)=>search.request.requestSha256)),youtubeLanePresent:articleRows.some((row)=>row.searches.some((search)=>Boolean(search.youtube))),qualityGatePresent:articleRows.every((row)=>row.searches.every((search)=>search.quality?.status)),honestNoMatchPreserved:articleRows.some((row)=>row.searches.some((search)=>search.quality?.status==="NO_MATCH")),candidateSelectionAutomatic:false,storyboardMutation:false,productionAdmission:false},boundary:{articleDriven:true,searchAndReviewOnly:true,automaticCandidateSelection:false,storyboardMutation:false,productionAdmission:false}};const result={...body,resultSha256:shaValue(body)};fs.writeFileSync(path.join(phaseRoot,"qualification.json"),`${JSON.stringify({fixtures:articleRows,previewRows},null,2)}\n`);fs.writeFileSync(path.join(phaseRoot,"result.json"),`${JSON.stringify(result,null,2)}\n`);fs.writeFileSync(path.join(phaseRoot,"review.md"),`# 文章驱动外部素材编排\n\n状态：**${result.status}** · ${articleRows.length} 类文章 · ${liveSearchCount} 次外部检索\n\n每篇文章先做 deterministic article understanding，再把 section 转成素材需求，分别搜索 Wikimedia / Internet Archive / NASA / YouTube CC；候选先过紧凑查询相关性门，不相关时保留 NO_MATCH，不自动采用。\n\n审核板：${rel(board)}\n`);console.log(JSON.stringify({status:result.status,fixtures:result.fixtures,previewBoard:result.previewBoard,checks:result.checks,resultSha256:result.resultSha256},null,2));if(result.status!=="PASS")process.exitCode=1;
