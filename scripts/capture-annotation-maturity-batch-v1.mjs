#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(import.meta.dirname,".."),runId=`annotation-source-${Date.now()}`,outputRoot=path.join(root,"work/screen-recording-maturity-test-v1/annotation-batch-v1"),out=path.join(outputRoot,runId),documentId=`screen_test_${runId}`;
fs.mkdirSync(out,{recursive:true});
const api=async(route,options)=>{const response=await fetch(`http://127.0.0.1:8766${route}`,options);if(!response.ok)throw new Error(`WORKBENCH_HTTP_${response.status}`);return response.json();};
const paragraphs=["保留这条证据，因为它来自真实来源。","删除这句错误结论，它与实际结果不一致。","最终只保留可验证的结果。","测试账号：demo@example.test"];
let created=false;
try{
  await api("/api/document",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId,documentType:"experiment",title:"录屏标注能力临时文档",contentHtml:paragraphs.map((text)=>`<p>${text}</p>`).join(""),contentText:paragraphs.join("\n\n"),metadata:{purpose:"screen-annotation-maturity",temporary:true}})});created=true;
  const scenario={contract:"A1GenericBrowserScreenScenario/v1",id:runId,productId:"writing-workbench",productCategory:"source-bound-annotation",projectRoot:"/Users/a1/Documents/Codex/写作项目/workbench_runtime",sourceFiles:["inline_editor_v2/app.js","inline_editor_v2/index.html"],url:`http://127.0.0.1:8766/v2/?documentId=${documentId}`,width:1920,height:1080,durationMs:10000,readySelector:"#editor",operations:[
    {atMs:800,type:"observe",name:"highlight-evidence",selector:"#editor p",index:0,targetKind:"TEXT",textRange:"真实来源"},
    {atMs:3000,type:"observe",name:"rejection-evidence",selector:"#editor p",index:1,targetKind:"TEXT",textRange:"错误结论"},
    {atMs:5200,type:"observe",name:"short-phrase-evidence",selector:"#editor p",index:2,targetKind:"TEXT",textRange:"可验证的结果"},
    {atMs:7400,type:"observe",name:"privacy-evidence",selector:"#editor p",index:3,targetKind:"TEXT",textRange:"demo@example.test"}
  ],primaryEvent:"highlight-evidence",directorPlan:{contract:"A1ScreenDirectorBrain/v1",sequence:"HIGHLIGHT_REJECT_CIRCLE_PRIVACY",beats:[{id:"highlight",technique:"HIGHLIGHT_WASH",event:"highlight-evidence"},{id:"reject",technique:"REJECTION_STRIKE",event:"rejection-evidence"},{id:"circle",technique:"SHORT_PHRASE_CIRCLE",event:"short-phrase-evidence"},{id:"privacy",technique:"PRIVACY_BLUR",event:"privacy-evidence"}],cameraBeats:[]}};
  const scenarioFile=path.join(out,"scenario.json");fs.writeFileSync(scenarioFile,`${JSON.stringify(scenario,null,2)}\n`);
  const result=spawnSync(process.execPath,[path.join(root,"scripts/capture-generic-browser-screen-proof-v1.mjs"),scenarioFile],{cwd:root,env:{...process.env,A1_GENERIC_CAPTURE_OUTPUT_ROOT:outputRoot},encoding:"utf8",maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,"capture.log"),result.stdout+result.stderr);if(result.status!==0)throw new Error(`ANNOTATION_CAPTURE_FAILED:${result.stderr.slice(-2000)}`);
  const reportPath=path.join(out,"capture-report.json");if(!fs.existsSync(reportPath))throw new Error("ANNOTATION_REPORT_MISSING");
  console.log(JSON.stringify({status:"READY_FOR_ANNOTATION_RENDER",out:path.relative(root,out),documentId,reportPath:path.relative(root,reportPath),temporaryDocumentRetained:false},null,2));
}finally{
  if(created)await fetch(`http://127.0.0.1:8766/api/document?documentId=${encodeURIComponent(documentId)}`,{method:"DELETE"}).catch(()=>{});
}
