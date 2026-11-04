#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {capturePersistentResultDomSnapshot,finalizePersistentResultDom,persistentResultDomTargetForShot} from "./lib/capture-persistent-result-dom-v1.mjs";
import {captureNarrationBoundTextRangeEvidence,captureTextRangeEvidence} from "./lib/capture-text-range-evidence-v1.mjs";
import {compileScreenAnnotationQualification} from "../apps/studio-next/src/lib/a1-screen-annotation-qualification-v1.mjs";
import {compileWaitOnlyRetime,assertRealScreenModelResponse} from "../apps/studio-next/src/lib/a1-screen-source-integration-v1.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const baseUrl=(process.env.A1_WRITING_WORKBENCH_URL||"http://127.0.0.1:8766").replace(/\/$/u,"");
const healthResponse=await fetch(`${baseUrl}/api/health`);
if(!healthResponse.ok)throw new Error(`capture-runtime-health:${healthResponse.status}`);
const runtimeHealth=await healthResponse.json();
if(!runtimeHealth.ok||!path.isAbsolute(runtimeHealth.root||""))throw new Error("capture-runtime-root-unavailable");
const writingRoot=runtimeHealth.root;
if(process.env.A1_WRITING_WORKBENCH_ROOT&&path.resolve(process.env.A1_WRITING_WORKBENCH_ROOT)!==path.resolve(writingRoot))throw new Error("capture-runtime-root-mismatch");
const draftPath=process.env.A1_CAPTURE_DRAFT_PATH||path.join(writingRoot,".cache/writing/latest_frontend_full_draft.json");
const rewriteEngineOverride=process.env.A1_CAPTURE_REWRITE_ENGINE||null;
if(rewriteEngineOverride&&!['deepseek','codex'].includes(rewriteEngineOverride))throw new Error("capture-rewrite-engine-invalid");
const planPath=path.join(root,"work/cap-native-production-v2/plan.json");
const shotId=process.env.A1_HEADLESS_SHOT_ID||process.argv[2]||"ED-04";
const paragraphSequence=process.env.A1_CAPTURE_SCOPE==="PARAGRAPH_SEQUENCE";
if(paragraphSequence&&shotId!=="ED-28")throw new Error("paragraph-sequence-shot-required");
let sequenceBinding=null;
const entryPreview=process.env.A1_CAPTURE_SCOPE==="ENTRY_PREVIEW";
if(entryPreview&&shotId!=="ED-02")throw new Error("entry-preview-shot-unsupported");
const stableLayout=process.env.A1_CAPTURE_STABLE_LAYOUT==="1";
let layoutSamples=[];
const textRangeCheckpointOnly=process.env.A1_TEXT_RANGE_CHECKPOINT_ONLY==="1";
const annotationCanaryText=String(process.env.A1_ANNOTATION_CANARY_TEXT||"").trim(),annotationCanaryIntent=process.env.A1_ANNOTATION_CANARY_INTENT==="EXACT_PHRASE"?"EXACT_PHRASE":"TEXT_ATTENTION";
const followTypingText=String(process.env.A1_FOLLOW_TYPING_TEXT||"").trim();
const captureScale=Math.max(1,Math.min(3,Number(process.env.A1_CAPTURE_SCALE||1))),captureWidth=1280,captureHeight=720,outputWidth=Math.round(captureWidth*captureScale),outputHeight=Math.round(captureHeight*captureScale),captureBitrate=captureScale>1?"42M":"16M";
const interactionWidth=captureScale>1?outputWidth:captureWidth,interactionHeight=captureScale>1?outputHeight:captureHeight;
const modelResponseTimeoutMs=Math.max(30000,Math.min(180000,Number(process.env.A1_MODEL_RESPONSE_TIMEOUT_MS||90000)));
const supported=new Set(["ED-02","ED-03","ED-04","ED-05","ED-06","ED-21","ED-22","ED-23","ED-24","ED-25","ED-26","ED-27","ED-28","ED-29","ED-30"]);
if(!supported.has(shotId))throw new Error(`headless-shot-unsupported:${shotId}`);
const plan=JSON.parse(fs.readFileSync(planPath,"utf8"));
const shot=plan.shots.find((item)=>item.shotId===shotId);
if(!shot)throw new Error(`headless-shot-plan-missing:${shotId}`);
{ // Every capture binds the current storyboard, not the historical Cap plan.
 const workspace=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),"utf8"));
 const current=workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find(item=>item.shotId===shotId);
 if(entryPreview&&current?.motionReviewPlan?.viewerRequirements?.scope!=="ENTRY_PREVIEW")throw new Error("entry-preview-current-plan-required");
 if(!current)throw new Error("current-shot-missing");
 if(paragraphSequence){const first=workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find(item=>item.shotId==="ED-27");if(!first)throw new Error("sequence-start-missing");sequenceBinding={shotIds:["ED-27","ED-28"],versions:[first.versionId,current.versionId],startMs:first.timeRange.startMs,endMs:current.timeRange.endMs};}
 shot.authority={...current};
 plan.source.workspaceSha256=workspace.workspaceSha256;
}
const durationMs=sequenceBinding?sequenceBinding.endMs-sequenceBinding.startMs:Number(shot.authority.timeRange.durationMs);
const runId=new Date().toISOString().replace(/[:.]/gu,"-");
const outRoot=path.join(root,"work",`headless-${shotId.toLowerCase()}-v1`,runId);
const videoDir=path.join(outRoot,"playwright-video");
const rawPath=path.join(outRoot,`${shotId.toLowerCase()}-raw.webm`);
const outputPath=path.join(outRoot,`${shotId.toLowerCase()}-project-only-cfr60.mp4`);
const contactPath=path.join(outRoot,"contact-sheet.png");
const reportPath=path.join(outRoot,"report.json");
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const ffprobe=path.join(root,".tools/bin/ffprobe");
const sha256=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
fs.mkdirSync(videoDir,{recursive:true});

async function requestJson(route,options={}){const response=await fetch(`${baseUrl}${route}`,options);const text=await response.text();if(!response.ok)throw new Error(`${options.method||"GET"} ${route}:${response.status}:${text.slice(0,300)}`);return text?JSON.parse(text):{};}
const laterRewritePhrase="我把另一段 AI 开头放进审稿，也想先找出套话、具体对象和读者后果。";
const selectedPhrase="当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力";
const approvedPhrase="我把 AI 直出的开头放进审稿，系统先标出这类套话，再要求补上具体对象和读者后果。";
const exactNegativePhrase="AI 正在改变内容生产";
const paragraphRequestText="写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。";
const savedEditMarker="这处修改会随最新版保存。";
const interceptPhrase="AI 正在重塑内容生产方式";
function taggedContentHtml(content){let value=String(content||"").replace(/<p>([^<]*当前行业正在快速发展[^<]*)<\/p>/u,'<p id="a1-action-original">$1</p>').replace(/<p>([^<]*我把 AI 直出的开头放进审稿[^<]*)<\/p>/u,'<p id="a1-action-approved">$1</p>');if(!value.includes(laterRewritePhrase))value+=`<p>${laterRewritePhrase}</p>`;if(!value.includes('id="a1-action-original"'))throw new Error("headless-shot-anchor-missing");return value;}
async function cleanup(documentId){await requestJson(`/api/document?documentId=${encodeURIComponent(documentId)}`,{method:"DELETE"}).catch(()=>{});for(const directory of ["documents","deleted_documents","topic_archives","deleted_topic_archives"].map((name)=>path.join(writingRoot,".cache/writing",name))){if(!fs.existsSync(directory))continue;for(const name of await fsp.readdir(directory))if(name.startsWith(documentId))await fsp.unlink(path.join(directory,name)).catch(()=>{});}}

const draft=JSON.parse(fs.readFileSync(draftPath,"utf8"));
const documentId=`headless_capture_${shotId.toLowerCase()}_${Date.now()}`;
const extraDocumentIds=[];
let seededContentHtml=taggedContentHtml(draft.content_html||draft.contentHtml);
if(shotId==="ED-25")seededContentHtml+=`<p>${interceptPhrase}</p>`;
const saveSeed=async(id,title,html,text)=>requestJson("/api/document",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:id,documentType:"experiment",title,contentHtml:html,contentText:text,metadata:{purpose:"Headless project-only screen capture"}})});
await saveSeed(documentId,draft.title,seededContentHtml,`${draft.title}\n\n${String(draft.body||"").trim()}${shotId==="ED-25"?`\n\n${interceptPhrase}`:""}`);
let referenceDocumentId="";
if(shotId==="ED-23"){
  for(let version=2;version<=5;version+=1)await saveSeed(documentId,draft.title,`${seededContentHtml}<p>当前主题版本 ${version}</p>`,`${draft.title}\n\n当前主题版本 ${version}`);
  referenceDocumentId=`${documentId}_other`;extraDocumentIds.push(referenceDocumentId);
  await saveSeed(referenceDocumentId,"另一篇独立文章","<h2>另一篇独立文章</h2><p>这是另一主题的正文，不包含当前文章内容。</p>","另一篇独立文章\n\n这是另一主题的正文，不包含当前文章内容。");
  await saveSeed(referenceDocumentId,"另一篇独立文章","<h2>另一篇独立文章</h2><p>这是另一主题的第二版，仍然独立保存。</p>","另一篇独立文章\n\n这是另一主题的第二版，仍然独立保存。");
}

let browser,context,page,video,profilePath,preparedParagraphSlot,styleMemoryMutationObserved=false,captureFailure=null,captureFailureContext=null;const events=[];const pointerTargets=[];const domTargets=[];const textRangeEvidence=[];const modelEvidence=[];const cursorTelemetry={moves:[],clicks:[]};const caretTelemetry=[];let pointer={x:1240*captureScale,y:680*captureScale};let t0=0;const elapsed=()=>Math.round(performance.now()-t0);const event=(name)=>events.push({name,tMs:elapsed()});
const persistentResultSpec=entryPreview?null:persistentResultDomTargetForShot(shotId);let persistentResultFirst=null,persistentResultFinal=null;
const waitUntil=async(ms)=>{while(performance.now()-t0<ms)await sleep(Math.min(50,ms-(performance.now()-t0)));};
const recordTarget=async(locator,eventName)=>{const box=await locator.boundingBox();if(!box)throw new Error(`headless-pointer-target-missing:${eventName}`);pointerTargets.push({event:eventName,x:(box.x+box.width/2)/interactionWidth,y:(box.y+box.height/2)/interactionHeight});};
try{
  profilePath=await fsp.mkdtemp(path.join(os.tmpdir(),"a1-headless-shot-"));
  browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--disable-blink-features=AutomationControlled","--no-default-browser-check","--no-first-run","--disable-features=TranslateUI"]});
  context=await browser.newContext({viewport:{width:outputWidth,height:outputHeight},deviceScaleFactor:1,recordVideo:{dir:videoDir,size:{width:outputWidth,height:outputHeight}}});
  if(rewriteEngineOverride)await context.route('**/api/rewrite-selection',async(route)=>{const request=route.request();await route.continue({postData:JSON.stringify({...request.postDataJSON(),engine:rewriteEngineOverride})});});
  if(captureScale>1)await context.addInitScript(({scale})=>{const apply=()=>{document.documentElement.style.zoom=String(scale);document.documentElement.dataset.a1HighDpiLayoutScale=String(scale);};if(document.documentElement)apply();else addEventListener("DOMContentLoaded",apply,{once:true});},{scale:captureScale});
  await context.addInitScript(()=>{const install=()=>{const style=document.createElement("style");style.dataset.a1CursorFreeCapture="true";style.textContent="html,body,body *{cursor:none!important}";document.documentElement.appendChild(style);document.documentElement.dataset.a1CursorFreeCapture="true";};if(document.documentElement)install();else addEventListener("DOMContentLoaded",install,{once:true});});
  if(captureScale>1)await context.addInitScript(({scale})=>{const corrected=new WeakMap();new MutationObserver(()=>{for(const menu of document.querySelectorAll("#selectionMenu,#selectionBanReasonPanel")){const before=menu.style.left+":"+menu.style.top;if(corrected.get(menu)===before)continue;const left=parseFloat(menu.style.left),top=parseFloat(menu.style.top);if(!Number.isFinite(left)||!Number.isFinite(top))continue;menu.style.left=`${left/scale}px`;menu.style.top=`${top/scale}px`;corrected.set(menu,menu.style.left+":"+menu.style.top);}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:["style"]});},{scale:captureScale});
  if(stableLayout)await context.addInitScript(()=>{const install=()=>{const style=document.createElement("style");style.dataset.a1StableCaptureLayout="true";style.textContent="html,body{overflow-anchor:none!important;scroll-behavior:auto!important}body .workspace,body.lite-mode .workspace{grid-template-columns:minmax(0,1fr) minmax(360px,400px)!important;gap:22px!important}body .paper{width:min(940px,100%)!important;justify-self:end!important}";document.documentElement.appendChild(style);};if(document.documentElement)install();else addEventListener("DOMContentLoaded",install,{once:true});});
  const menuTextPx=Number(process.env.A1_CAPTURE_MENU_TEXT_PX||0);
  if(menuTextPx){
    if(!Number.isFinite(menuTextPx)||menuTextPx<14||menuTextPx>22)throw new Error("capture-menu-text-size-invalid");
    await context.addInitScript(size=>{const install=()=>{const style=document.createElement("style");style.dataset.a1CaptureMenuText="true";style.textContent=`#selectionMenu button{font-size:${size}px!important}`;document.documentElement.appendChild(style);};if(document.documentElement)install();else addEventListener("DOMContentLoaded",install,{once:true});},menuTextPx);
  }
  page=await context.newPage();video=page.video();
  await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`,{waitUntil:"networkidle",timeout:60000});
  await page.waitForFunction(()=>document.querySelector("#editor")?.innerText?.length>500,null,{timeout:60000});
  const domIdentity=await page.evaluate(()=>({url:location.href,title:document.title,editor:Boolean(document.querySelector("#editor")),finalReview:Boolean(document.querySelector("#finalReviewButton")),presentation:Boolean(document.querySelector("#presentDraft")),candidates:Boolean(document.querySelector("#candidateList")),banReasonPanel:Boolean(document.querySelector("#selectionBanReasonPanel")),cursorFreeCapture:document.documentElement.dataset.a1CursorFreeCapture==="true"}));
  if(!domIdentity.editor||!domIdentity.finalReview||!domIdentity.presentation||!domIdentity.candidates||!domIdentity.cursorFreeCapture)throw new Error(`headless-shot-dom-identity:${JSON.stringify(domIdentity)}`);
  if(shotId==="ED-24"&&!domIdentity.banReasonPanel)throw new Error(`headless-shot-runtime-contract:selection-ban-reason-panel-missing:${domIdentity.url}`);
  await page.evaluate(()=>{document.documentElement.dataset.a1HeadlessCapture="project-only";});
  const dragPhrase=async(phrase,durationMs=350)=>{
    const points=await page.evaluate(needle=>{
      const walker=document.createTreeWalker(document.querySelector("#editor"),NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode,index=node.textContent?.indexOf(needle)??-1;if(index<0)continue;
        return Array.from({length:needle.length},(_,i)=>{const range=document.createRange();range.setStart(node,index+i);range.setEnd(node,index+i+1);const rect=range.getBoundingClientRect();return {left:rect.left,right:rect.right,y:rect.top+rect.height/2};});
      }
      return [];
    },phrase);
    if(!points.length||points.some(p=>p.left<0||p.right>interactionWidth||p.y<0||p.y>interactionHeight))throw new Error("native-selection-range-outside-viewport");
    const start={x:points[0].left+.5,y:points[0].y};
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    const started=elapsed();event("selection_drag_started");cursorTelemetry.clicks.push({tMs:started,x:start.x/interactionWidth,y:start.y/interactionHeight,down:true,event:"selection_drag"});
    try {
      for(let i=0;i<points.length;i++){
        await sleep(Math.max(0,started+durationMs*(i+1)/points.length-elapsed()));
        const point={x:points[i].right-.5,y:points[i].y};await page.mouse.move(point.x,point.y);
        cursorTelemetry.moves.push({tMs:elapsed(),x:point.x/interactionWidth,y:point.y/interactionHeight});
      }
    } finally {await page.mouse.up();}
    const last=points.at(-1);cursorTelemetry.clicks.push({tMs:elapsed(),x:(last.right-.5)/interactionWidth,y:last.y/interactionHeight,down:false,event:"selection_drag"});
    const selected=await page.evaluate(()=>getSelection()?.toString()||"");
    if(selected!==phrase)throw new Error(`native-selection-exact-text-mismatch:${selected}`);
  };
  const selectPhrase=async(phrase)=>{const selected=await page.evaluate((needle)=>{const editor=document.querySelector("#editor");const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;const index=node.textContent?.indexOf(needle)??-1;if(index<0)continue;node.parentElement?.scrollIntoView({block:"center",behavior:"auto"});const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+needle.length);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event("selectionchange",{bubbles:true}));return selection.toString();}return "";},phrase);if(selected!==phrase)throw new Error(`headless-selection-failed:${selected}`);};
  const glide=async(target,durationMs=360)=>{const origin={...pointer};const steps=Math.max(12,Math.round(durationMs/16));for(let index=1;index<=steps;index+=1){const p=index/steps;const eased=p*p*(3-2*p);pointer={x:origin.x+(target.x-origin.x)*eased,y:origin.y+(target.y-origin.y)*eased};await page.mouse.move(pointer.x,pointer.y);cursorTelemetry.moves.push({tMs:elapsed(),x:pointer.x/interactionWidth,y:pointer.y/interactionHeight});await sleep(durationMs/steps);}};
  const clickLocator=async(locator,eventName,durationMs=360)=>{const box=await locator.boundingBox();if(!box)throw new Error(`headless-pointer-target-missing:${eventName}`);const target={x:box.x+box.width/2,y:box.y+box.height/2};pointerTargets.push({event:eventName,x:target.x/interactionWidth,y:target.y/interactionHeight});await glide(target,durationMs);cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/interactionWidth,y:pointer.y/interactionHeight,down:true,event:eventName});await locator.click({timeout:10000,delay:70});cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/interactionWidth,y:pointer.y/interactionHeight,down:false,event:eventName});};
  const ensurePanelAfterClick=async(trigger,panel,eventName)=>{await clickLocator(trigger,eventName,360);try{await panel.waitFor({state:"visible",timeout:1800});}catch{if(!(await trigger.isVisible()))throw new Error(`headless-panel-trigger-lost:${eventName}`);await trigger.click({force:true});try{await panel.waitFor({state:"visible",timeout:5000});}catch{const state=await page.evaluate(()=>({selection:getSelection()?.toString()||"",rangeCount:getSelection()?.rangeCount||0,panelHidden:document.querySelector("#selectionBanReasonPanel")?.hidden,menuHidden:document.querySelector("#selectionMenu")?.hidden,menuStatus:document.querySelector("#selectionMenuStatus")?.textContent||"",activeElement:document.activeElement?.id||document.activeElement?.tagName||""}));throw new Error(`headless-panel-open-failed:${eventName}:${JSON.stringify(state)}`);}}};
  const recordDomTarget=async(locator,targetKey,eventName,shape="ROUNDED_RECTANGLE")=>{const box=await locator.boundingBox();if(!box)throw new Error(`headless-dom-target-missing:${targetKey}:${eventName}`);const scroll=await page.evaluate(()=>({x:window.scrollX,y:window.scrollY}));domTargets.push({targetKey,event:eventName,source:"EVENT_DOM_RECT",shape,capturedAtMs:elapsed(),sourceRect:{x:box.x/interactionWidth,y:box.y/interactionHeight,width:box.width/interactionWidth,height:box.height/interactionHeight},viewport:{width:interactionWidth,height:interactionHeight},scroll});};
  const recordTextRange=async(text,eventName,semanticIntent="TEXT_ATTENTION")=>{const evidence=await captureTextRangeEvidence(page,{text,observedAtMs:elapsed(),rangeToken:`${shotId}:${eventName}`});const qualification=compileScreenAnnotationQualification({evidence,semanticIntent,cameraProjection:{visibleRatio:evidence.viewportVisibilityRatio}});textRangeEvidence.push({event:eventName,evidence,qualification});};
  const recordNarrationBoundRange=async(narrationText,eventName,semanticIntent="TEXT_ATTENTION")=>{const evidence=await captureNarrationBoundTextRangeEvidence(page,{narrationText,observedAtMs:elapsed(),rangeToken:`${shotId}:${eventName}`});const qualification=compileScreenAnnotationQualification({evidence,semanticIntent,cameraProjection:{visibleRatio:evidence.viewportVisibilityRatio}});textRangeEvidence.push({event:eventName,evidence,qualification});};
  const recordCaret=async(eventName)=>{const sample=await page.evaluate(()=>{const selection=getSelection();if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0).cloneRange();range.collapse(false);let rect=range.getBoundingClientRect();if(!rect.width&&!rect.height){const marker=document.createElement("span");marker.textContent="\u200b";range.insertNode(marker);rect=marker.getBoundingClientRect();marker.remove();selection.removeAllRanges();selection.addRange(range);}return{x:(rect.x+Math.max(1,rect.width)/2)/innerWidth,y:(rect.y+Math.max(1,rect.height)/2)/innerHeight,width:Math.max(1,rect.width)/innerWidth,height:Math.max(1,rect.height)/innerHeight,scrollX,scrollY};});if(sample)caretTelemetry.push({tMs:elapsed(),event:eventName,...sample});};
  const markPersistentResultEvent=async(eventName)=>{event(eventName);if(!persistentResultSpec||persistentResultSpec.resultEvent!==eventName)return;if(persistentResultFirst)throw new Error(`headless-persistent-result-dom:${persistentResultSpec.targetKey}:FIRST_OBSERVATION_DUPLICATE`);if(shotId==="ED-27"){const bound=await page.evaluate((needle)=>{const node=[...document.querySelectorAll("#editor p")].find((item)=>(item.textContent||"").includes(needle));if(!node)return false;node.id="a1-paragraph-request-result";node.scrollIntoView({block:"center",behavior:"auto"});return true;},paragraphRequestText);if(!bound)throw new Error("headless-persistent-result-dom:paragraph-input-slot:REQUEST_TEXT_NODE_MISSING");}await sleep(220);persistentResultFirst=await capturePersistentResultDomSnapshot(page,{spec:persistentResultSpec,observedAtMs:elapsed(),tokenSeed:`${shotId}-${runId}`});};
  const prepositionPhrase=async(phrase)=>{const positioned=await page.evaluate((needle)=>{const editor=document.querySelector("#editor");const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(!(node.textContent||"").includes(needle))continue;node.parentElement?.scrollIntoView({block:"center",behavior:"auto"});window.getSelection()?.removeAllRanges();return true;}return false;},phrase);if(!positioned)throw new Error(`headless-preposition-phrase-missing:${phrase}`);};
  if(shotId==="ED-02")await prepositionPhrase(selectedPhrase);
  if(shotId==="ED-03")await prepositionPhrase(approvedPhrase);
  if(shotId==="ED-24")await prepositionPhrase(exactNegativePhrase);
  if(shotId==="ED-26"){
    await prepositionPhrase(approvedPhrase);
    // Establish both real actions before the capture clock; never hide the next
    // selection below the viewport while claiming a continuous demonstration.
    await page.evaluate(phrases=>{
      const ranges=()=>phrases.map(needle=>{const walker=document.createTreeWalker(document.querySelector("#editor"),NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode,i=n.textContent?.indexOf(needle)??-1;if(i<0)continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+needle.length);return r.getBoundingClientRect();}throw new Error("capture-action-range-missing");});
      let boxes=ranges();const top=Math.min(...boxes.map(r=>r.top)),bottom=Math.max(...boxes.map(r=>r.bottom));
      if(bottom-top>innerHeight*.75)throw new Error("capture-action-context-does-not-fit");
      scrollBy(0,(top+bottom)/2-innerHeight*.48);
      boxes=ranges();if(boxes.some(r=>r.top<innerHeight*.10||r.bottom>innerHeight*.84))throw new Error("capture-action-context-outside-safe-area");
    },[approvedPhrase,laterRewritePhrase]);
  }
  if(shotId==="ED-22")await page.locator("#editor > :last-child").scrollIntoViewIfNeeded();
  if(annotationCanaryText)await prepositionPhrase(annotationCanaryText);
  if(["ED-04","ED-27","ED-28"].includes(shotId))await page.locator("#a1-action-original").scrollIntoViewIfNeeded();
  if(shotId==="ED-21")await page.locator("#a1-action-original").evaluate((node)=>node.scrollIntoView({block:"center",behavior:"auto"}));
  if(shotId==="ED-04"&&stableLayout){
    const anchor=page.locator("#a1-action-original");const created=await anchor.evaluate(node=>window.createParagraphAssistSlotAfter(node));if(!created)throw new Error("headless-ed04-slot-prepare-failed");preparedParagraphSlot=page.locator('p[data-paragraph-assist-slot="1"]');await preparedParagraphSlot.evaluate(node=>node.scrollIntoView({block:"center",behavior:"auto"}));
  }
  if(shotId==="ED-28"&&!paragraphSequence){
    const anchor=page.locator("#a1-action-original");const created=await anchor.evaluate((node)=>typeof window.createParagraphAssistSlotAfter==="function"&&window.createParagraphAssistSlotAfter(node));if(!created)throw new Error("headless-ed28-slot-prepare-failed");preparedParagraphSlot=page.locator('p[data-paragraph-assist-slot="1"]');await preparedParagraphSlot.click({force:true});await page.keyboard.type(paragraphRequestText,{delay:2});await page.waitForFunction(()=>(document.querySelector("#paragraphAssistState")?.textContent||"").includes("可补写"));
  }
  if(paragraphSequence)await page.locator("#a1-action-original").evaluate(node=>node.scrollIntoView({block:"center",behavior:"auto"}));
  await sleep(500);
  if((paragraphSequence||shotId==="ED-26"||shotId==="ED-04")&&stableLayout)await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;window.__a1SuppressedScrolls=[];Element.prototype.scrollIntoView=function(...args){window.__a1SuppressedScrolls.push({tag:this.tagName,id:this.id});};window.__a1OriginalScrollIntoView=original;});
  if(stableLayout)await page.evaluate(()=>{window.__a1LayoutSamples=[];const start=performance.now();window.__a1LayoutTimer=setInterval(()=>{const p=document.querySelector("#a1-action-original"),paper=document.querySelector(".paper");if(!p||!paper)return;const r=p.getBoundingClientRect(),d=paper.getBoundingClientRect();window.__a1LayoutSamples.push({tMs:performance.now()-start,x:r.x,y:r.y,width:r.width,height:r.height,paperX:d.x,paperWidth:d.width,scrollY,viewportWidth:innerWidth,viewportHeight:innerHeight});},33);});
  t0=performance.now();cursorTelemetry.moves.push({tMs:0,x:pointer.x/interactionWidth,y:pointer.y/interactionHeight});event("start");
  if(shotId==="ED-21"){
    event("document_opened");await recordDomTarget(page.locator("#a1-action-approved"),"source-paragraph","document_opened");if(annotationCanaryText)await recordTextRange(annotationCanaryText,"document_opened",annotationCanaryIntent);const anchor=page.locator("#a1-action-original"),editMarker=followTypingText||" 我在这里补了一句。";await clickLocator(anchor,"edit_started",420);await anchor.evaluate((node)=>{node.focus();const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});await recordCaret("typing_start");for(let index=0;index<editMarker.length;index+=1){await page.keyboard.type(editMarker[index],{delay:followTypingText?65:45});await recordCaret(`typing_${index+1}`);}await page.locator("#editor").dispatchEvent("input");await sleep(700);await page.waitForFunction((marker)=>(document.querySelector("#a1-action-original")?.textContent||"").includes(marker),editMarker,{timeout:5000});await markPersistentResultEvent("edit_applied");await waitUntil(Math.max(0,durationMs-250));
  }
  if(shotId==="ED-22"){
    const lastParagraph=page.locator("#editor > :last-child");await clickLocator(lastParagraph,"save_edit_marker",320);await page.evaluate(()=>{const editor=document.querySelector("#editor");const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);editor.focus();});await page.keyboard.press("Enter");await page.keyboard.type(savedEditMarker,{delay:18});await page.waitForFunction((marker)=>document.querySelector("#editor")?.innerText?.includes(marker),savedEditMarker,{timeout:5000});event("unsaved_edit_visible");await page.keyboard.press("Meta+s");event("save_shortcut");try{await page.waitForFunction(()=>(document.querySelector("#draftNotice")?.textContent||"").includes("Command+S 已保存"),null,{timeout:30000});}catch(error){throw new Error(`headless-ed22-save-confirmation-timeout:${error.message}`);}event("save_confirmed");await page.reload({waitUntil:"networkidle"});try{await page.waitForFunction((marker)=>document.querySelector("#editor")?.innerText?.includes(marker),savedEditMarker,{timeout:30000});}catch(error){throw new Error(`headless-ed22-reopen-marker-timeout:${error.message}`);}await prepositionPhrase(savedEditMarker);event("reopened_latest_verified");await waitUntil(durationMs);
  }
  if(shotId==="ED-23"){
    const versionSummary=page.locator("details.latest-fold > summary");await clickLocator(versionSummary,"current_topic_versions",320);const topic=page.locator("#topicArchiveList details");await topic.waitFor({state:"visible"});await clickLocator(topic.locator("summary"),"current_topic_versions_open",260);await page.waitForFunction(()=>document.querySelectorAll("#topicArchiveList .topic-archive-entry").length===5);event("current_topic_five_versions");await recordDomTarget(topic,"history-panel","current_topic_five_versions");await waitUntil(3100);await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(referenceDocumentId)}`,{waitUntil:"networkidle",timeout:60000});await page.locator("details.latest-fold > summary").click();const referenceTopic=page.locator("#topicArchiveList details");await referenceTopic.waitFor({state:"visible"});await referenceTopic.locator("summary").click();const [ownArchive, otherArchive] = await Promise.all([requestJson(`/api/topic-archive?documentId=${encodeURIComponent(documentId)}`), requestJson(`/api/topic-archive?documentId=${encodeURIComponent(referenceDocumentId)}`)]);const ownIds = new Set((ownArchive.entries || []).map((entry) => entry.archiveId));const isolation = {isolated: ownArchive.documentId === documentId && otherArchive.documentId === referenceDocumentId && ownArchive.entries.every((entry) => entry.documentId === documentId) && otherArchive.entries.every((entry) => entry.documentId === referenceDocumentId && !ownIds.has(entry.archiveId)), ownEntryCount: ownArchive.entries?.length || 0, referenceEntryCount: otherArchive.entries?.length || 0};if(!isolation.isolated || isolation.ownEntryCount !== 5 || isolation.referenceEntryCount < 1) throw new Error(`headless-ed23-isolation-proof:${JSON.stringify(isolation)}`);await page.waitForFunction(() => document.querySelector("#editor")?.innerText?.includes("另一主题") && !document.querySelector("#editor")?.innerText?.includes("当前行业正在快速发展"));event("reference_topic_isolated");await recordDomTarget(referenceTopic,"history-panel","reference_topic_isolated");await waitUntil(durationMs);
  }
  if(shotId==="ED-25"){
    await selectPhrase(interceptPhrase);event("similar_phrase_selected");await recordTextRange(interceptPhrase,"similar_phrase_selected");const intercept=await page.evaluate(({text,id})=>window.runPreferenceInterceptCheck(text,{documentId:id,proposedKind:"rewrite"}),{text:interceptPhrase,id:documentId});if(!intercept?.intercept||intercept.opposing?.[0]?.reason!=="太空、没动作、太枯燥")throw new Error(`headless-ed25-intercept-proof:${JSON.stringify(intercept)}`);await page.waitForSelector("#preferenceInterceptPanel",{state:"visible"});await clickLocator(page.locator("#preferenceInterceptPanel"),"intercept_panel_hold",360);await markPersistentResultEvent("preference_intercept_matched");event("rewrite_expand_choices_visible");await waitUntil(Math.max(0,durationMs-250));
  }
  if(shotId==="ED-02"&&entryPreview){
    await waitUntil(100);
    await dragPhrase(selectedPhrase);event("sentence_selected");
    await page.waitForSelector("#selectionMenu [data-run]",{state:"visible"});
    await recordDomTarget(page.locator("#selectionMenu [data-run]"),"rewrite-entry","rewrite_entry_visible");
    event("rewrite_entry_visible");
    await recordTextRange(selectedPhrase,"sentence_selected","EXACT_PHRASE");
    await waitUntil(durationMs+150);
  }
  if(shotId==="ED-02"&&!entryPreview){
    await selectPhrase(selectedPhrase);event("sentence_selected");await recordTextRange(selectedPhrase,"sentence_selected");await page.waitForSelector("#selectionMenu [data-run]",{state:"visible"});
    const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/rewrite-selection")&&response.request().method()==="POST",{timeout:modelResponseTimeoutMs}).catch((error)=>{captureFailure ||= error;return null;});
    const rewriteButton = page.locator("#selectionMenu [data-run]");
    await recordTarget(rewriteButton, "rewrite_click");
    const rewriteBox = await rewriteButton.boundingBox();
    await rewriteButton.click({timeout: 10000});
    cursorTelemetry.clicks.push({tMs:elapsed(),x:(rewriteBox.x+rewriteBox.width/2)/interactionWidth,y:(rewriteBox.y+rewriteBox.height/2)/interactionHeight,down:true,event:"rewrite_click"});
    event("rewrite_request_started");
    const response=await responsePromise;if(!response)throw captureFailure;const payload=await response.json();await page.waitForSelector("#candidateList .candidate-text",{state:"visible",timeout:90000});
    modelEvidence.push({operation:'rewrite',engine:payload.engine,requestedModel:payload.engine==='codex'?'CODEX_CONFIGURED_DEFAULT':runtimeHealth.deepseek_rewrite_model||runtimeHealth.deepseek_model,variantCount:payload.variants?.length||0});
    event("rewrite_candidates_visible");
    const acceptedText = (await page.locator("#candidateList .candidate-text").first().innerText()).trim();
    await clickLocator(page.locator("#candidateList [data-accept]").first(), "rewrite_accept", 300);
    await page.waitForFunction((text) => document.querySelector("#editor")?.innerText?.includes(text), acceptedText, {timeout: 10000});
    event("rewrite_applied");await markPersistentResultEvent("result_hold");await sleep(900);
    if(!payload?.engine||/fallback|heuristic|mock/iu.test(payload.engine)||(payload.variants?.length||0)<3)throw new Error(`headless-ed02-real-result-missing:${JSON.stringify({engine:payload?.engine,count:payload?.variants?.length||0})}`);
  }
  if(shotId==="ED-03"){
    await selectPhrase(approvedPhrase);await recordTextRange(approvedPhrase,"approved_phrase_selected");await page.waitForSelector("#selectionMenu [data-like]",{state:"visible"});await clickLocator(page.locator("#selectionMenu [data-like]"),"like_click",360);event("like_click");await page.waitForFunction(()=>(document.querySelector("#selectionMenuStatus")?.textContent||"").includes("已记"));
    await selectPhrase(selectedPhrase);await recordTextRange(selectedPhrase,"rejected_phrase_selected");await page.waitForSelector("#selectionMenu [data-ban]",{state:"visible"});if(domIdentity.banReasonPanel){await clickLocator(page.locator("#selectionMenu [data-ban]"),"ban_reason_open",420);await page.waitForSelector("#selectionBanReasonPanel",{state:"visible"});await page.locator("#selectionBanReason").fill("看着别扭，不符合当前风格");event("ban_reason_entered");await clickLocator(page.locator("#selectionBanReasonPanel [data-ban-confirm]"),"ban_click",300);}else{await page.locator("#selectionMenu [data-ban]").click();}event("ban_click");await page.waitForFunction(()=>(document.querySelector("#selectionMenuStatus")?.textContent||"").includes("已记"));await markPersistentResultEvent("style_library_hold");await waitUntil(Math.max(0,durationMs-250));
  }
  if(shotId==="ED-24"){
    await selectPhrase(exactNegativePhrase);event("sentence_selected");await recordNarrationBoundRange(`${shot.authority.sourceText}\n${Object.values(shot.authority.actionContract||{}).join("\n")}`,"sentence_selected","EXACT_PHRASE");
    if(textRangeCheckpointOnly){event("text_range_checkpoint_hold");await waitUntil(900);}
    else{await waitUntil(2740);event("selected_phrase_hold");const banTrigger=page.locator("#selectionMenu [data-ban]"),banPanel=page.locator("#selectionBanReasonPanel");await banTrigger.waitFor({state:"visible"});await waitUntil(4380);await selectPhrase(exactNegativePhrase);await sleep(140);await ensurePanelAfterClick(banTrigger,banPanel,"ban_reason_open");await recordDomTarget(banPanel,"ban-reason-panel","ban_reason_open");const reasonInput=page.locator("#selectionBanReason");await clickLocator(reasonInput,"ban_reason_input",260);await reasonInput.fill("太空、没动作、太枯燥");event("ban_reason_entered");const confirm=page.locator("#selectionBanReasonPanel [data-ban-confirm]");await clickLocator(confirm,"ban_click",300);event("ban_click");await sleep(1000);if(await page.evaluate(()=>document.querySelector("#selectionMenuStatus")?.dataset.state==="busy"))await confirm.evaluate((button)=>button.click());await page.waitForFunction(()=>["ok","error"].includes(document.querySelector("#selectionMenuStatus")?.dataset.state||""));const decisionState=await page.locator("#selectionMenuStatus").getAttribute("data-state");if(decisionState!=="ok")throw new Error(`headless-ed24-ban-save:${await page.locator("#selectionMenuStatus").textContent()}`);styleMemoryMutationObserved=true;await waitUntil(8140);event("style_library_hold");await waitUntil(durationMs);}
  }
  if(shotId==="ED-26"){
    await selectPhrase(approvedPhrase);event("approved_line_selected");await recordTextRange(approvedPhrase,"approved_line_selected");await page.waitForSelector("#selectionMenu [data-like]",{state:"visible"});await waitUntil(2120);await clickLocator(page.locator("#selectionMenu [data-like]"),"like_click",300);event("like_click");await page.waitForFunction(()=>(document.querySelector("#selectionMenuStatus")?.textContent||"").includes("已记"));
    await selectPhrase(laterRewritePhrase);await recordTextRange(laterRewritePhrase,"later_rewrite_phrase_selected");await page.waitForSelector("#selectionMenu [data-run]",{state:"visible"});await waitUntil(3800);const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/rewrite-selection")&&response.request().method()==="POST",{timeout:90000});await clickLocator(page.locator("#selectionMenu [data-run]"),"rewrite_click",340);event("rewrite_click");const response=await responsePromise;const payload=await response.json();await page.waitForSelector("#candidateList .candidate-text",{state:"visible",timeout:90000});modelEvidence.push({operation:'preference-rewrite',engine:payload.engine,requestedModel:payload.engine==='codex'?'CODEX_CONFIGURED_DEFAULT':runtimeHealth.deepseek_rewrite_model||runtimeHealth.deepseek_model,variantCount:payload.variants?.length||0});const approvedCount=Number(payload?.memoryProof?.counts?.approved||0);const preferApplied=Boolean(payload?.memoryProof?.applied?.prefer);const candidateCount=Array.isArray(payload?.variants)?payload.variants.length:0;if(approvedCount<1||!preferApplied||candidateCount<1||/fallback|heuristic|mock/iu.test(payload?.engine||""))throw new Error(`headless-ed26-preference-proof:${JSON.stringify({approvedCount,preferApplied,candidateCount,engine:payload?.engine})}`);modelEvidence.at(-1).memoryProof={approvedCount,preferApplied};event("candidates_with_memory_hold");await recordDomTarget(page.locator("#candidateList .candidate").first(),"preference-candidate-card","candidates_with_memory_hold");await sleep(3000);
  }
  if(shotId==="ED-27"){
    event("paragraph_anchor_hold");await waitUntil(1860);event("paragraph_gap_context_hold");await waitUntil(4630);const anchor=page.locator("#a1-action-original");const created=await anchor.evaluate((node)=>typeof window.createParagraphAssistSlotAfter==="function"&&window.createParagraphAssistSlotAfter(node));if(!created)throw new Error("headless-ed27-slot-create-failed");const slot=page.locator('p[data-paragraph-assist-slot="1"]');await slot.waitFor({state:"visible"});await clickLocator(slot,"paragraph_slot_created",360);await slot.click({force:true});event("paragraph_slot_created");await recordDomTarget(slot,"paragraph-input-slot","paragraph_slot_created");await waitUntil(7954);event("paragraph_request_started");await page.keyboard.type(paragraphRequestText.slice(0,18),{delay:22});await waitUntil(10909);event("paragraph_request_mid");await page.keyboard.type(paragraphRequestText.slice(18),{delay:18});await page.waitForFunction(()=>(document.querySelector("#paragraphAssistState")?.textContent||"").includes("可补写"));await markPersistentResultEvent("paragraph_request_ready");await waitUntil(Math.max(0,durationMs-250));
  }
  if(shotId==="ED-28"){
    if(paragraphSequence){
      event("paragraph_gap_context_hold");await waitUntil(2200);
      const created=await page.locator("#a1-action-original").evaluate(node=>window.createParagraphAssistSlotAfter(node));if(!created)throw new Error("sequence-slot-create-failed");
      preparedParagraphSlot=page.locator('p[data-paragraph-assist-slot="1"]');await preparedParagraphSlot.click({force:true});event("paragraph_slot_created");
      await waitUntil(6200);await page.keyboard.type(paragraphRequestText,{delay:65});event("paragraph_request_ready");await waitUntil(12940);
    }
    const slot=preparedParagraphSlot;if(!slot)throw new Error("headless-ed28-slot-missing");const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/paragraph-assist")&&response.request().method()==="POST",{timeout:90000});await waitUntil(620);if(!paragraphSequence)await page.keyboard.press("End");await page.keyboard.press("Enter");cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/interactionWidth,y:pointer.y/interactionHeight,down:true,event:"paragraph_request_run"});event("paragraph_request_run");const response=await responsePromise;const payload=await response.json();modelEvidence.push({operation:"paragraph-assist",engine:payload.engine,requestedModel:payload.engine==='codex'?'CODEX_CONFIGURED_DEFAULT':runtimeHealth.deepseek_paragraph_assist_model||runtimeHealth.deepseek_model,variantCount:payload.variants?.length||0});if(!response.ok()||!payload.engine||/local|fallback|heuristic|mock/iu.test(payload.engine))throw new Error(`headless-ed28-real-model-required:${payload.engine}`);await page.waitForSelector("#candidateList .candidate-text",{state:"visible",timeout:90000});event("paragraph_candidates_hold");await recordDomTarget(page.locator("#candidateList .candidate-text").first(),"paragraph-candidate","paragraph_candidates_hold");await recordDomTarget(page.locator("#candidateList .candidate").first(),"paragraph-candidate-card","paragraph_candidates_hold");for(const [key,selector] of [["head",".candidate-head"],["actions",".candidate-actions"]])await recordDomTarget(page.locator("#candidateList .candidate").first().locator(selector),`paragraph-candidate-${key}`,"paragraph_candidates_hold");await sleep(paragraphSequence?2200:900);const accept=page.locator("#candidateList [data-accept]").first();await clickLocator(accept,"paragraph_candidate_applied",360);await page.waitForFunction(()=>(document.querySelector("#selectionState")?.textContent||"").includes("已补段"));event("paragraph_candidate_applied");await recordDomTarget(page.locator("#editor"),"applied-document","paragraph_candidate_applied");if((payload?.variants?.length||0)<1)throw new Error("headless-ed28-candidates-missing");await sleep(paragraphSequence?2400:1500);
  }
  if(shotId==="ED-04"){
    event("paragraph_anchor_hold");await waitUntil(1450);
    let slot=preparedParagraphSlot;
    if(!slot){const anchor=page.locator("#a1-action-original");await anchor.scrollIntoViewIfNeeded();const created=await anchor.evaluate(node=>typeof window.createParagraphAssistSlotAfter==="function"&&window.createParagraphAssistSlotAfter(node));if(!created)throw new Error("headless-ed04-slot-create-failed");slot=page.locator('p[data-paragraph-assist-slot="1"]');await slot.waitFor({state:"visible"});event("paragraph_slot_created");}else event("paragraph_slot_ready");
    await recordDomTarget(slot,"paragraph-input-slot",preparedParagraphSlot?"paragraph_slot_ready":"paragraph_slot_created");
    await clickLocator(slot,"paragraph_slot_created",320);await slot.click({force:true});await page.keyboard.type("写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。",{delay:7});await page.waitForFunction(()=>(document.querySelector("#paragraphAssistState")?.textContent||"").includes("可补写"));await waitUntil(3050);event("paragraph_request_entered");await recordDomTarget(slot,"paragraph-input-slot","paragraph_request_entered");
    const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/paragraph-assist")&&response.request().method()==="POST",{timeout:90000});
    await waitUntil(4100);await glide({x:(await slot.boundingBox()).x+40*captureScale,y:(await slot.boundingBox()).y+24*captureScale},220);await recordDomTarget(slot,"paragraph-input-slot","paragraph_request_run");const beforeSubmitScroll=await page.evaluate(()=>scrollY);await slot.evaluate(node=>{node.focus();const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});if(stableLayout&&Math.abs((await page.evaluate(()=>scrollY))-beforeSubmitScroll)>2)throw new Error("paragraph-submit-focus-scroll-drift");await page.keyboard.press("Enter");cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/interactionWidth,y:pointer.y/interactionHeight,down:true,event:"paragraph_request_run"});event("paragraph_request_run");const response=await responsePromise;const payload=await response.json();
    assertRealScreenModelResponse(payload,response.ok());modelEvidence.push({operation:'paragraph-assist',engine:payload.engine,requestedModel:payload.engine==='codex'?'CODEX_CONFIGURED_DEFAULT':runtimeHealth.deepseek_paragraph_assist_model||runtimeHealth.deepseek_model,variantCount:payload.variants.length});fs.writeFileSync(path.join(outRoot,'model-response-proof.json'),JSON.stringify({modelEvidence,responseSha256:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')},null,2));
    await page.waitForSelector("#candidateList .candidate-text",{state:"visible",timeout:90000});await waitUntil(5300);await markPersistentResultEvent("paragraph_candidates_hold");await waitUntil(Math.max(0,durationMs-250));
    if((Array.isArray(payload?.variants)?payload.variants.length:await page.locator("#candidateList .candidate-text").count())<1)throw new Error("headless-ed04-candidates-missing");
  }
  if(["ED-05","ED-29"].includes(shotId)){
    const button=page.locator("#finalReviewButton");const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/final-review")&&response.request().method()==="POST",{timeout:90000});
    await waitUntil(shotId==="ED-05"?720:800);await clickLocator(button,"review_click",300);event("review_click");await sleep(600);event("review_running");const response=await responsePromise;let payload=await response.json();
    if(payload?.jobId){let job=null;const deadline=Date.now()+360000;while(Date.now()<deadline){job=await requestJson(`/api/final-review-job/${encodeURIComponent(payload.jobId)}`);if(job.status==="done")break;if(job.status==="error")throw new Error(`headless-final-review-job:${job.error||"unknown"}`);await sleep(1500);}if(job?.status!=="done"||!job.result)throw new Error(`headless-final-review-job-timeout:${payload.jobId}`);payload=job.result;const rendered=await page.evaluate((result)=>typeof window.renderFinalReviewResult==="function"&&(window.renderFinalReviewResult(result),true),payload);if(!rendered)throw new Error("headless-final-review-render-function-missing");}
    await page.waitForFunction(()=>document.querySelectorAll(".final-review-item").length>=1||Boolean(document.querySelector(".final-review-empty")),null,{timeout:90000});await markPersistentResultEvent("review_findings_hold");await sleep(shotId==="ED-05"?2200:1800);event("review_suggestion_hold");await waitUntil(Math.max(0,durationMs-250));
    const findings=Array.isArray(payload?.findings)?payload.findings.length:Array.isArray(payload?.items)?payload.items.length:await page.locator(".final-review-item").count();if(findings<1)throw new Error("headless-ed05-findings-missing");
  }
  if(shotId==="ED-06"){
    const presentButton=page.locator("#presentDraft");await waitUntil(760);await clickLocator(presentButton,"presentation_open",300);await page.waitForFunction(()=>!document.querySelector("#presentationMode")?.hasAttribute("hidden"));event("presentation_open");
    await waitUntil(2300);const fontControl=page.locator("#presentationFontSize");await clickLocator(fontControl,"presentation_font_size",260);await fontControl.fill("68");const speedControl=page.locator("#presentationSpeed");await clickLocator(speedControl,"presentation_speed",260);await speedControl.fill("155");event("presentation_adjusted");
    const playButton=page.locator("#presentationPlay");await waitUntil(3300);await clickLocator(playButton,"presentation_playing",280);event("presentation_playing");await waitUntil(4820);
  }
  if(shotId==="ED-30"){
    event("draft_ready_hold");await waitUntil(1850);
    const presentButton=page.locator("#presentDraft");await clickLocator(presentButton,"presentation_open",320);await page.waitForFunction(()=>!document.querySelector("#presentationMode")?.hasAttribute("hidden"));event("presentation_open");
    await waitUntil(3450);const fontControl=page.locator("#presentationFontSize");await clickLocator(fontControl,"presentation_font_size",260);await fontControl.fill("68");const speedControl=page.locator("#presentationSpeed");await clickLocator(speedControl,"presentation_speed",260);await speedControl.fill("155");event("presentation_adjusted");
    const playButton=page.locator("#presentationPlay");await waitUntil(5100);await clickLocator(playButton,"presentation_playing",280);event("presentation_playing");await waitUntil(6620);
  }
  if(persistentResultSpec){if(!persistentResultFirst)throw new Error(`headless-persistent-result-dom:${persistentResultSpec.targetKey}:RESULT_EVENT_NOT_OBSERVED`);await waitUntil(Math.max(0,durationMs-250));persistentResultFinal=await capturePersistentResultDomSnapshot(page,{spec:persistentResultSpec,observedAtMs:elapsed(),tokenSeed:`${shotId}-${runId}`,expectedNodeTokens:persistentResultFirst.nodeTokens});await waitUntil(durationMs);}
  event("end");if(stableLayout)layoutSamples=await page.evaluate(()=>{clearInterval(window.__a1LayoutTimer);return window.__a1LayoutSamples;});await context.close();const finalizedVideoPath=await video.path();await fsp.copyFile(finalizedVideoPath,rawPath);await browser.close();browser=null;
}catch(error){captureFailure=error;captureFailureContext=await page?.evaluate(()=>({selectionMenuStatus:document.querySelector("#selectionMenuStatus")?.textContent||"",selectionMenuState:document.querySelector("#selectionMenuStatus")?.dataset.state||"",banPanelHidden:document.querySelector("#selectionBanReasonPanel")?.hidden,banConfirmDisabled:document.querySelector("#selectionBanReasonPanel [data-ban-confirm]")?.disabled,workspaceToast:document.querySelector("#workspaceToast")?.textContent||""})).catch(()=>null);}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});if(profilePath)await fsp.rm(profilePath,{recursive:true,force:true}).catch(()=>{});await cleanup(documentId);for(const id of extraDocumentIds)await cleanup(id);}
if(captureFailure){const failureBody={contract:"A1HeadlessWritingWorkbenchShotFailure/v1",status:"BLOCKED",shotId,captureDensity:{logicalWidth:captureWidth,logicalHeight:captureHeight,deviceScaleFactor:captureScale,outputWidth,outputHeight,highDpiSource:captureScale>=2},failure:{name:captureFailure instanceof Error?captureFailure.name:"Error",message:captureFailure instanceof Error?captureFailure.message:String(captureFailure)},failureContext:captureFailureContext,events,pointerTargetCount:pointerTargets.length,domTargetCount:domTargets.length,boundary:{temporaryDocumentDeleted:true,productionWorkspaceMutation:false,currentPhaseMutation:false,productionAdmission:false,userVisualApproval:"NOT_APPROVED"},failedAt:new Date().toISOString()};failureBody.failureSha256=crypto.createHash("sha256").update(JSON.stringify(failureBody)).digest("hex");fs.writeFileSync(reportPath,`${JSON.stringify(failureBody,null,2)}\n`);console.error(JSON.stringify({...failureBody,reportPath:path.relative(root,reportPath)},null,2));throw captureFailure;}

const rawProbe=JSON.parse(execFileSync(ffprobe,["-v","error","-show_entries","format=duration","-of","json",rawPath],{encoding:"utf8"}));
const rawDuration=Number(rawProbe.format.duration);const wallDuration=events.at(-1).tMs/1000;const startOffset=Math.max(0,rawDuration-wallDuration);
const targetSeconds=durationMs/1000;const selectedDuration=Math.max(.5,rawDuration-startOffset);const speed=targetSeconds/selectedDuration;
let mapOutputMs=(timeMs)=>Math.round(timeMs/1000*speed*1000);
if(entryPreview){
  execFileSync(ffmpeg,["-v","error","-y","-ss",String(startOffset),"-i",rawPath,"-t",String(targetSeconds),"-vf","fps=60,tpad=stop_mode=clone:stop_duration=1","-an","-c:v","h264_videotoolbox","-b:v",captureBitrate,"-pix_fmt","yuv420p",outputPath]);
  mapOutputMs=(timeMs)=>Math.round(timeMs);
}else if(["ED-02", "ED-26", "ED-28"].includes(shotId)){
  const waitStartMs = shotId !== "ED-28" ? cursorTelemetry.clicks.find((item) => item.down && item.event === "rewrite_click")?.tMs : events.find((item) => item.name === "paragraph_request_run")?.tMs;
  const waitEndMs = events.find((item) => item.name === (shotId === "ED-02" ? "rewrite_candidates_visible" : shotId === "ED-26" ? "candidates_with_memory_hold" : "paragraph_candidates_hold"))?.tMs;
  const timing = compileWaitOnlyRetime({waitStartMs, waitEndMs, sourceDurationMs: events.at(-1).tMs, targetDurationMs: durationMs});
  fs.writeFileSync(path.join(outRoot, "wait-only-retime.json"), JSON.stringify(timing, null, 2));
  const filter = timing.segments.map((segment, index) => `[0:v]trim=start=${startOffset + segment.sourceStartMs / 1000}:end=${startOffset + segment.sourceEndMs / 1000},setpts=(PTS-STARTPTS)*${segment.outputDurationMs / (segment.sourceEndMs - segment.sourceStartMs)}[v${index}]`).join(";") + `;[v0][v1][v2]concat=n=3:v=1:a=0,fps=60,tpad=stop_mode=clone:stop_duration=${Math.max(.5, timing.padHoldMs / 1000)}[v]`;
  execFileSync(ffmpeg,["-v","error","-y","-i",rawPath,"-filter_complex",filter,"-map","[v]","-t",String(targetSeconds),"-an","-c:v","h264_videotoolbox","-b:v",captureBitrate,"-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",outputPath]);
  mapOutputMs = (timeMs) => {let outputMs = 0;for (const segment of timing.segments) {if (timeMs <= segment.sourceEndMs) return Math.round(outputMs + Math.max(0, timeMs - segment.sourceStartMs) * segment.outputDurationMs / (segment.sourceEndMs - segment.sourceStartMs));outputMs += segment.outputDurationMs;}return Math.round(outputMs);};
}else if(["ED-04","ED-26"].includes(shotId)){
  const markerA=shotId==="ED-02"?cursorTelemetry.clicks.find((item)=>item.down&&item.event==="rewrite_click")?.tMs:shotId==="ED-04"?events.find((item)=>item.name==="paragraph_request_run")?.tMs:events.find((item)=>item.name==="rewrite_click")?.tMs;
  const markerB=events.find((item)=>item.name===(shotId==="ED-02"?"result_hold":shotId==="ED-04"?"paragraph_candidates_hold":"candidates_with_memory_hold"))?.tMs;
  const endMs=events.at(-1).tMs;
  if(!Number.isFinite(markerA)||!Number.isFinite(markerB)||markerB<=markerA||endMs<=markerB)throw new Error(`headless-semantic-retime-markers:${shotId}:${JSON.stringify({markerA,markerB,endMs})}`);
  const desiredA=shotId==="ED-02"?.62:shotId==="ED-04"?4.0:4.55,desiredB=shotId==="ED-02"?1.12:shotId==="ED-04"?5.22:6.0;
  const rawA=markerA/1000,rawB=markerB/1000,rawEnd=endMs/1000;
  const scaleA=desiredA/rawA,scaleB=(desiredB-desiredA)/(rawB-rawA),scaleC=(targetSeconds-desiredB)/(rawEnd-rawB);
  const filter=`[0:v]trim=start=${startOffset}:end=${startOffset+rawA},setpts=(PTS-STARTPTS)*${scaleA}[v0];[0:v]trim=start=${startOffset+rawA}:end=${startOffset+rawB},setpts=(PTS-STARTPTS)*${scaleB}[v1];[0:v]trim=start=${startOffset+rawB}:end=${startOffset+rawEnd},setpts=(PTS-STARTPTS)*${scaleC}[v2];[v0][v1][v2]concat=n=3:v=1:a=0,fps=60,tpad=stop_mode=clone:stop_duration=0.5[v]`;
  execFileSync(ffmpeg,["-v","error","-y","-i",rawPath,"-filter_complex",filter,"-map","[v]","-t",String(targetSeconds),"-an","-c:v","h264_videotoolbox","-b:v",captureBitrate,"-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",outputPath]);
  mapOutputMs=(timeMs)=>{const seconds=timeMs/1000;if(seconds<=rawA)return Math.round(seconds*scaleA*1000);if(seconds<=rawB)return Math.round((desiredA+(seconds-rawA)*scaleB)*1000);return Math.round((desiredB+(seconds-rawB)*scaleC)*1000);};
}else if(["ED-05","ED-29"].includes(shotId)){
  const clickSeconds=events.find((item)=>item.name==="review_click").tMs/1000;
  const findingsSeconds=events.find((item)=>item.name==="review_findings_hold").tMs/1000;
  const endSeconds=events.at(-1).tMs/1000;
  const preRawEnd=Math.min(findingsSeconds-.2,clickSeconds+.55);
  const preOutEnd=shotId==="ED-05"?1.3:1.15,findingsOut=shotId==="ED-05"?3.5:3.25;
  // FFmpeg concat rounds each variable-rate segment boundary down to the
  // nearest source frame. Give the final stable result hold a small overrun;
  // the authoritative `-t` cut then lands on the exact target duration.
  const postOut=targetSeconds-findingsOut+.12;
  const preScale=preOutEnd/preRawEnd;
  const waitScale=(findingsOut-preOutEnd)/(findingsSeconds-preRawEnd);
  const postScale=postOut/(endSeconds-findingsSeconds);
  const filter=`[0:v]trim=start=${startOffset}:end=${startOffset+preRawEnd},setpts=(PTS-STARTPTS)*${preScale}[v0];[0:v]trim=start=${startOffset+preRawEnd}:end=${startOffset+findingsSeconds},setpts=(PTS-STARTPTS)*${waitScale}[v1];[0:v]trim=start=${startOffset+findingsSeconds}:end=${startOffset+endSeconds},setpts=(PTS-STARTPTS)*${postScale}[v2];[v0][v1][v2]concat=n=3:v=1:a=0,tpad=stop_mode=clone:stop_duration=0.12,fps=60[v]`;
  execFileSync(ffmpeg,["-v","error","-y","-i",rawPath,"-filter_complex",filter,"-map","[v]","-t",String(targetSeconds),"-an","-c:v","h264_videotoolbox","-b:v",captureBitrate,"-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",outputPath]);
  mapOutputMs=(timeMs)=>{const seconds=timeMs/1000;if(seconds<=preRawEnd)return Math.round(seconds*preScale*1000);if(seconds<=findingsSeconds)return Math.round((preOutEnd+(seconds-preRawEnd)*waitScale)*1000);return Math.round((findingsOut+(seconds-findingsSeconds)*postScale)*1000);};
}else execFileSync(ffmpeg,["-v","error","-y","-ss",String(startOffset),"-i",rawPath,"-vf",`setpts=${speed}*PTS,fps=60`,"-t",String(targetSeconds),"-an","-c:v","h264_videotoolbox","-b:v",captureBitrate,"-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",outputPath]);
const probe=JSON.parse(execFileSync(ffprobe,["-v","error","-count_frames","-show_entries","stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size","-of","json",outputPath],{encoding:"utf8"}));const stream=probe.streams.find((item)=>item.codec_type==="video");const outputDuration=Number(probe.format.duration);const frameCount=Number(stream.nb_read_frames);
if(stream.width!==outputWidth||stream.height!==outputHeight||stream.r_frame_rate!=="60/1"||Math.abs(outputDuration-targetSeconds)>.04||frameCount<Math.floor(outputDuration*59.5))throw new Error(`headless-shot-output-contract:${JSON.stringify(probe)}`);
const decode=spawnSync(ffmpeg,["-v","error","-i",outputPath,"-f","null","-"],{encoding:"utf8"});if(decode.status!==0)throw new Error(`headless-shot-decode:${decode.stderr}`);
execFileSync(ffmpeg,["-v","error","-y","-i",outputPath,"-vf",`fps=1,scale=320:180,tile=${Math.ceil(targetSeconds)}x1`,"-frames:v","1",contactPath]);
const mappedEvents=events.map((item)=>({...item,outputTimeMs:Math.min(durationMs,mapOutputMs(item.tMs))}));
const eventOutputMap=new Map(mappedEvents.map((item)=>[item.name,item.outputTimeMs]));
const mappedPointerTargets=pointerTargets.map((item)=>({...item,atMs:eventOutputMap.get(item.event)}));
const mappedDomTargets=domTargets.map((item)=>({...item,capturedAtMs:Math.min(durationMs,mapOutputMs(item.capturedAtMs))}));
const mappedTextRangeEvidence=textRangeEvidence.map((item)=>({...item,evidence:{...item.evidence,observedAtMs:Math.min(durationMs,mapOutputMs(item.evidence.observedAtMs))}}));
const mappedCursorTelemetry={moves:cursorTelemetry.moves.map((item)=>({...item,tMs:Math.min(durationMs,mapOutputMs(item.tMs))})),clicks:cursorTelemetry.clicks.map((item)=>({...item,tMs:Math.min(durationMs,mapOutputMs(item.tMs))}))};
const mappedCaretTelemetry=caretTelemetry.map((item)=>({...item,tMs:Math.min(durationMs,mapOutputMs(item.tMs))}));
const persistentResultDom=persistentResultSpec?finalizePersistentResultDom({spec:persistentResultSpec,first:persistentResultFirst,final:persistentResultFinal,mapOutputMs,authorityDurationMs:durationMs}):null;
const storyboardBinding={contract:"A1BackgroundStoryboardBinding/v1",workspaceSha256:plan.source.workspaceSha256,shotId,versionId:shot.authority.versionId,revisionSha256:shot.authority.revisionSha256,actionId:shot.execution.actionId,cameraRecipeSha256:shot.execution.cameraRecipe.recipeSha256,actionContractSha256:crypto.createHash("sha256").update(JSON.stringify(shot.authority.actionContract)).digest("hex"),sourceTextSha256:crypto.createHash("sha256").update(shot.authority.sourceText).digest("hex"),timeRange:shot.authority.timeRange};
const drift=(key)=>layoutSamples.length?Math.max(...layoutSamples.map(s=>s[key]))-Math.min(...layoutSamples.map(s=>s[key])):null;
const layoutStability=stableLayout?{contract:"A1CaptureLayoutStability/v1",profile:"RESERVED_RESULT_COLUMN",scope:"ISOLATED_CAPTURE_PRESENTATION_ONLY",sampleCount:layoutSamples.length,drift:{x:drift("x"),y:drift("y"),width:drift("width"),scrollY:drift("scrollY")},samples:layoutSamples.map(s=>({...s,outputTimeMs:mapOutputMs(s.tMs)}))}:null;
if(layoutStability){layoutStability.status=layoutSamples.length>5&&Object.values(layoutStability.drift).every(v=>v<=2)?"PASS":"BLOCKED";if(layoutStability.status!=="PASS"){fs.writeFileSync(path.join(outRoot,"layout-failure.json"),JSON.stringify(layoutStability,null,2));throw new Error(`capture-layout-unstable:${JSON.stringify(layoutStability.drift)}`);}}
const report={contract:"A1HeadlessWritingWorkbenchShot/v1",status:"READY_FOR_ACTUAL_PIXEL_REVIEW",shotId,demonstrationScope:paragraphSequence?"PARAGRAPH_SEQUENCE":entryPreview?"ENTRY_PREVIEW":"FULL_FLOW",sequenceBinding,captureBackend:"PLAYWRIGHT_HEADLESS_CDP_INPUT",captureScope:"BROWSER_PAGE_VIEWPORT_ONLY",captureDensity:{logicalWidth:captureWidth,logicalHeight:captureHeight,deviceScaleFactor:captureScale,outputWidth,outputHeight,highDpiSource:captureScale>=2},desktopCapturePossible:false,headedWindowCreated:false,frontmostApplicationMutation:false,cursorPixelPolicy:"SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY",paragraphSlotPreparedBeforeRecording:Boolean(preparedParagraphSlot)&&shotId==="ED-04",prepositionedBeforeRecording:["ED-02","ED-03","ED-04","ED-24","ED-26","ED-27","ED-28"].includes(shotId),storyboardBinding,sourceWorkspaceSha256:plan.source.workspaceSha256,sourceStoryboardVersionId:shot.authority.versionId,sourceStoryboardRevisionSha256:shot.authority.revisionSha256,authorityDurationMs:durationMs,runtimeBinding:{baseUrl,runtimeRoot:writingRoot,serverSourceSha256:sha256(path.join(writingRoot,"tools/inline_editor_server.py")),draftSourceSha256:sha256(draftPath),configuredModel:runtimeHealth.deepseek_model,rewriteEngineOverride},layoutStability,modelEvidence,events:mappedEvents,pointerTargets:mappedPointerTargets,domTargets:mappedDomTargets,textRangeEvidence:mappedTextRangeEvidence,persistentResultDom,cursorTelemetry:mappedCursorTelemetry,caretTelemetry:mappedCaretTelemetry,output:{path:path.relative(root,outputPath),sha256:sha256(outputPath),width:stream.width,height:stream.height,fps:stream.r_frame_rate,frameCount,durationMs:Math.round(outputDuration*1000),fullDecodePass:true},evidence:{contactSheet:path.relative(root,contactPath),contactSheetSha256:sha256(contactPath)},boundary:{temporaryDocumentDeleted:true,extraTemporaryDocumentsDeleted:extraDocumentIds.length,productionWorkspaceMutation:false,currentPhaseMutation:false,userStyleMemoryMutation:styleMemoryMutationObserved?"EXPECTED_ACTION_SIDE_EFFECT":false,productionAdmission:false,userVisualApproval:"NOT_APPROVED"},generatedAt:new Date().toISOString()};
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({...report,reportPath:path.relative(root,reportPath)},null,2));
