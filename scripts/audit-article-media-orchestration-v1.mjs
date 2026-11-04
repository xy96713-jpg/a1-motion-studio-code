#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const phaseRoot=path.resolve(root,process.env.A1_ARTICLE_MEDIA_OUTPUT_DIR||"work/article-media-orchestration-v1");
const result=JSON.parse(fs.readFileSync(path.join(phaseRoot,"result.json"),"utf8"));
const qualification=JSON.parse(fs.readFileSync(path.join(phaseRoot,"qualification.json"),"utf8"));
const phase=JSON.parse(fs.readFileSync(path.join(phaseRoot,"phase-contract.json"),"utf8"));
const current=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"),"utf8"));
const authority=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"),"utf8"));
const failures=[];const check=(condition,id)=>{if(!condition)failures.push(id)};const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
check(result.contract==="A1ArticleMediaOrchestrationQualification/v1"&&result.status==="PASS","RESULT_NOT_PASS");
check(result.fixtures?.length===3&&new Set(result.fixtures.map((fixture)=>fixture.genre)).size===3,"THREE_GENRES_REQUIRED");
for(const row of qualification.fixtures||[])check(row.id&&row.genre,"FIXTURE_NOT_PASS:"+(row.id||"missing"));
for(const row of qualification.articles||[])for(const search of row.searches||[]){check(Boolean(search.request?.requestSha256),"REQUEST_SHA_MISSING:"+row.id+":"+search.beatId);check(Boolean(search.external?.status||search.youtube?.status),"SEARCH_MISSING:"+row.id+":"+search.beatId);}
for(const article of result.articles||[]){check(article.understanding.coverageExact===true,"UNDERSTANDING_NOT_EXACT:"+article.id);check(article.orchestration.beatCount>=2,"BEATS_MISSING:"+article.id);}
const board=path.join(root,result.previewBoard.path);check(fs.existsSync(board)&&shaFile(board)===result.previewBoard.sha256,"BOARD_SHA");if(fs.existsSync(board)){const metadata=await sharp(board).metadata();const stats=await sharp(board).stats();check(metadata.width===result.previewBoard.width&&metadata.height===result.previewBoard.height,"BOARD_DIMENSIONS");check(Math.max(...stats.channels.slice(0,3).map((channel)=>channel.stdev))>=8,"BOARD_NOT_VISIBLE");}
for(const key of ["threeGenres","articleUnderstandingExact","semanticBeatsDriveSearch","multiSourceSearchExecuted","providerProvenanceBound","youtubeLanePresent","qualityGatePresent","honestNoMatchPreserved"])check(result.checks?.[key]===true,"RESULT_CHECK:"+key);
check(result.checks?.candidateSelectionAutomatic===false&&result.checks?.storyboardMutation===false&&result.checks?.productionAdmission===false,"BOUNDARY_CHANGED");
const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-article-media-orchestration-v1.mjs"),"utf8");for(const term of [...(phase.generality?.forbiddenFixtureIds||[]),...(phase.generality?.forbiddenTopicTerms||[])])check(!runtime.includes(term),"RUNTIME_FIXTURE_LEAK:"+term);
const currentSha=current.authority?.workspaceSha256||current.workspaceSha256||null;check(authority.status==="PASS"&&authority.authority?.workspaceSha256===currentSha,"CURRENT_AUTHORITY_CHANGED_OR_STALE");
const body={contract:"A1ArticleMediaOrchestrationAudit/v1",status:failures.length?"FAIL":"PASS",phaseId:phase.phaseId,resultSha256:result.resultSha256,fixtures:result.fixtures,previewBoard:result.previewBoard,checks:result.checks,boundary:result.boundary,failures};const report={...body,auditSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};fs.writeFileSync(path.join(phaseRoot,"audit.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
