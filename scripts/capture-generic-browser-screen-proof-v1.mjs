#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {chromium} from "playwright";
import sharp from "sharp";
import {buildScreenGeometryFrame, compileScreenGeometryTruth} from "../apps/studio-next/src/lib/a1-screen-geometry-truth-v2.mjs";

const root=path.resolve(import.meta.dirname,".."),scenarioPath=path.resolve(root,process.argv[2]||""),scenario=process.argv[2]&&fs.existsSync(scenarioPath)?JSON.parse(fs.readFileSync(scenarioPath,"utf8")):null;
if(!scenario||scenario.contract!=="A1GenericBrowserScreenScenario/v1"||!scenario.id||!scenario.productId||!scenario.url||!scenario.projectRoot||!Array.isArray(scenario.operations)||scenario.operations.length<1)throw new Error("usage:capture-generic-browser-screen-proof-v1 <scenario.json>");
if(!/^[a-z0-9][a-z0-9._-]*$/u.test(String(scenario.id)))throw new Error("generic-screen-scenario-id-must-be-path-safe");
const width=Number(scenario.width||1280),height=Number(scenario.height||720),durationMs=Number(scenario.durationMs||7000);if(width<960||height<540||durationMs<3000||durationMs>60000)throw new Error("generic-screen-scenario-geometry-or-duration-invalid");
const outRoot=path.resolve(root,process.env.A1_GENERIC_CAPTURE_OUTPUT_ROOT||"work/cross-project-screen-validation-v1"),out=path.join(outRoot,scenario.id),videoDir=path.join(out,"playwright-video"),rawPath=path.join(out,"raw.webm"),cleanPath=path.join(out,"clean-source.mp4"),syncFramePath=path.join(out,"sync-frame.png"),contactPath=path.join(out,"contact-sheet.png"),reportPath=path.join(out,"capture-report.json"),ffmpeg=path.join(root,".tools/bin/ffmpeg"),ffprobe=path.join(root,".tools/bin/ffprobe"),shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),shaValue=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
fs.mkdirSync(videoDir,{recursive:true});
const projectRoot=path.resolve(scenario.projectRoot);
const gitCheck=spawnSync("git",["rev-parse","--show-toplevel"],{cwd:projectRoot,encoding:"utf8"});
const hasGit=gitCheck.status===0;
if(!hasGit&&(!Array.isArray(scenario.sourceFiles)||!scenario.sourceFiles.length))throw new Error("NON_GIT_PROJECT_REQUIRES_SCOPED_SOURCE_FILES");
const gitState=()=>hasGit?execFileSync("git",["status","--porcelain=v1","--untracked-files=no"],{cwd:projectRoot,encoding:"utf8"}):JSON.stringify(scenario.sourceFiles.map(file=>{const absolute=path.resolve(projectRoot,file);if(!absolute.startsWith(projectRoot+path.sep))throw new Error("SOURCE_FILE_OUTSIDE_PROJECT");return{file,sha256:shaFile(absolute)};}));
const gitBefore=gitState(),gitHead=hasGit?execFileSync("git",["rev-parse","HEAD"],{cwd:projectRoot,encoding:"utf8"}).trim():null;
let browser,context,page,video;
const events=[],cursorTelemetry={moves:[],clicks:[]},scrollTelemetry=[],dragTelemetry=[],retryIntervals=[],typingTelemetry=[],editTelemetry=[],waitTelemetry=[],domTargets=[],geometryTargets=[],clickTargetProof=[],dragSelectionProofs=[];let sourcePointerEvents=[],sourcePointerTimeOrigin=null;
let t0=0,pointer={x:width*.82,y:height*.82};
const elapsed=()=>Math.round(performance.now()-t0);
const waitUntil=async(ms)=>{while(elapsed()<ms)await sleep(Math.min(40,ms-elapsed()));};
const locatorFor=(operation)=>{const base=page.locator(operation.selector);if(operation.index===-1||operation.index==="last")return base.last();if(Number.isInteger(operation.index))return base.nth(operation.index);return base.first();};
const recordTarget=async(locator,eventName,targetKind="UI",exactText=null)=>{
  const box=await locator.boundingBox();
  if(!box)throw new Error(`generic-screen-target-missing:${eventName}`);
  const details=await locator.evaluate((node,needle)=>{
    const range=document.createRange();
    if(needle){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let match=null;while(walker.nextNode()){const text=walker.currentNode.textContent||"",index=text.indexOf(needle);if(index>=0){match={node:walker.currentNode,index};break;}}if(!match)return{missing:true,text:null,lineRects:[],scroll:{x:scrollX,y:scrollY}};range.setStart(match.node,match.index);range.setEnd(match.node,match.index+needle.length);}else range.selectNodeContents(node);
    const rects=[...range.getClientRects()].map((rect)=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height})).filter((rect)=>rect.width>1&&rect.height>1);
    return{missing:false,text:(range.toString()||node.innerText||node.textContent||"").replace(/\s+/gu," ").trim(),lineRects:rects,scroll:{x:scrollX,y:scrollY}};
  },exactText);
  if(details.missing)throw new Error(`generic-screen-text-range-missing:${eventName}`);
  const clipRect=(rect)=>{const left=Math.max(0,Math.min(width,rect.x)),top=Math.max(0,Math.min(height,rect.y)),right=Math.max(left,Math.min(width,rect.x+rect.width)),bottom=Math.max(top,Math.min(height,rect.y+rect.height));return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;};
  const clippedBox=clipRect(box);if(!clippedBox)throw new Error(`generic-screen-target-offscreen:${eventName}`);
  const lineRectsCss=targetKind==="TEXT"?details.lineRects.map(clipRect).filter(Boolean):[];
  const capturedAtMs=elapsed(),row={event:eventName,capturedAtMs,kind:targetKind,text:details.text||null,scroll:details.scroll,sourceRect:{x:clippedBox.x/width,y:clippedBox.y/height,width:clippedBox.width/width,height:clippedBox.height/height},lineRects:lineRectsCss.map((rect)=>({x:rect.x/width,y:rect.y/height,width:rect.width/width,height:rect.height/height}))};
  domTargets.push(row);
  geometryTargets.push({targetKey:eventName,event:eventName,kind:targetKind,selector:locator.toString(),identity:{event:eventName,textSha256:details.text?shaValue(details.text):null,scroll:details.scroll},confidence:1,observedAtMs:capturedAtMs,rectCss:clippedBox,...(lineRectsCss.length?{lineRectsCss}:{})});
  return{box:clippedBox,row};
};
const recordClickTarget=async(locator,eventName)=>{const box=await locator.boundingBox();if(!box)throw new Error(`generic-screen-click-target-missing:${eventName}`);const clickAtMs=elapsed(),inside=pointer.x>=box.x&&pointer.x<=box.x+box.width&&pointer.y>=box.y&&pointer.y<=box.y+box.height,centerX=box.x+box.width/2,centerY=box.y+box.height/2,centerErrorPx=Math.hypot(pointer.x-centerX,pointer.y-centerY);const existing=geometryTargets.find((target)=>target.targetKey===eventName);if(existing){existing.rectCss={x:box.x,y:box.y,width:box.width,height:box.height};existing.observedAtMs=clickAtMs;existing.clickObservedAtMs=clickAtMs;}clickTargetProof.push({event:eventName,clickAtMs,pointerCss:{x:pointer.x,y:pointer.y},pointerNormalized:{x:pointer.x/width,y:pointer.y/height},targetRectCss:{x:box.x,y:box.y,width:box.width,height:box.height},insideTarget:inside,centerErrorPx});return{box};};
const glide=async(target,duration=360)=>{target={x:Math.max(2,Math.min(width-2,target.x)),y:Math.max(2,Math.min(height-2,target.y))};const origin={...pointer},steps=Math.max(12,Math.round(duration/16));for(let index=1;index<=steps;index+=1){const raw=index/steps,eased=raw*raw*(3-2*raw);pointer={x:origin.x+(target.x-origin.x)*eased,y:origin.y+(target.y-origin.y)*eased};await page.mouse.move(pointer.x,pointer.y);cursorTelemetry.moves.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height});await sleep(duration/steps);}};
let geometryRuntime = null, syncRegions = [];
try{
  const browserArgs=["--disable-blink-features=AutomationControlled","--no-first-run","--disable-features=TranslateUI"];if(scenario.webgl===true)browserArgs.push("--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--disable-dev-shm-usage","--force-prefers-reduced-motion=no-preference");
  browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:browserArgs});
  context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,recordVideo:{dir:videoDir,size:{width,height}}});
  await context.addInitScript(()=>{
    const install=()=>{const style=document.createElement("style");style.textContent="html{scroll-behavior:auto!important}";document.documentElement.appendChild(style);};
    if(document.documentElement)install();else addEventListener("DOMContentLoaded",install,{once:true});
    const rows=[],last={x:-Infinity,y:-Infinity,t:-Infinity};
    const selectorOf=(node)=>{if(!(node instanceof Element))return null;if(node.id)return "#"+CSS.escape(node.id);const path=[];for(let item=node;item&&item!==document.documentElement&&path.length<5;item=item.parentElement){const peers=item.parentElement?[...item.parentElement.children].filter((peer)=>peer.tagName===item.tagName):[];path.unshift(item.tagName.toLowerCase()+":nth-of-type("+(peers.indexOf(item)+1)+")");}return path.join(" > ");};
    const record=(event)=>{const time=event.timeStamp,x=event.clientX,y=event.clientY;if(event.type==="pointermove"&&Math.hypot(x-last.x,y-last.y)<2&&time-last.t<16)return;last.x=x;last.y=y;last.t=time;const node=event.target instanceof Element?event.target:null,rect=node?.getBoundingClientRect();rows.push({type:event.type,pagePerformanceTimeMs:time,pointerType:event.pointerType||"mouse",isTrusted:event.isTrusted,buttons:event.buttons,cssX:x,cssY:y,targetSelector:selectorOf(node),targetTag:node?.tagName?.toLowerCase()||null,targetId:node?.id||null,cursorCss:node?getComputedStyle(node).cursor:null,targetRect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null});};
    for(const type of ["pointermove","pointerdown","pointerup","click"])document.addEventListener(type,record,true);
    window.__a1NativePointerEventLog=rows;
  });
  page=await context.newPage();if(scenario.webgl===true)await page.emulateMedia({reducedMotion:"no-preference"});video=page.video();await page.goto(scenario.url,{waitUntil:"networkidle",timeout:90000});if(scenario.readySelector)await page.locator(scenario.readySelector).first().waitFor({state:"visible",timeout:30000});
  geometryRuntime=await page.evaluate(() => ({viewportCss:{x:0,y:0,width:innerWidth,height:innerHeight},devicePixelRatio:window.devicePixelRatio,pageZoom:window.visualViewport?.zoom||1,visualViewport:window.visualViewport?{offsetX:window.visualViewport.offsetLeft,offsetY:window.visualViewport.offsetTop,scale:window.visualViewport.scale,zoom:window.visualViewport.zoom||1,width:window.visualViewport.width,height:window.visualViewport.height}:null,scroll:{x:window.scrollX,y:window.scrollY}}));
  for(const selector of scenario.syncSelectors||[]){const box=await page.locator(selector).first().boundingBox();if(box)syncRegions.push({selector,x:Math.max(0,Math.min(width,box.x)),y:Math.max(0,Math.min(height,box.y)),width:Math.max(1,Math.min(width-box.x,box.width)),height:Math.max(1,Math.min(height-box.y,box.height))});}
  for(const operation of scenario.prepare||[]){if(operation.type==="click")await locatorFor(operation).click();else if(operation.type==="scroll")await locatorFor(operation).scrollIntoViewIfNeeded();else if(operation.type==="wait")await sleep(operation.ms||250);}
  await sleep(300);await page.screenshot({path:syncFramePath,animations:"disabled"});
  await page.evaluate(()=>{const marker=document.createElement('div');marker.id='a1-recording-sync';marker.style.cssText='position:fixed;inset:0;background:rgb(255,0,255);z-index:2147483647;pointer-events:none';document.documentElement.appendChild(marker);});
  await sleep(400);
  await page.evaluate(()=>document.getElementById('a1-recording-sync').remove());
  const pointerSyncStarted=performance.now(),pagePerfNow=await page.evaluate(()=>performance.now()),pointerSyncFinished=performance.now();
  t0=(pointerSyncStarted+pointerSyncFinished)/2;
  sourcePointerTimeOrigin={pagePerformanceNowMs:pagePerfNow,captureElapsedAtAnchorMs:t0-t0,alignmentUncertaintyMs:(pointerSyncFinished-pointerSyncStarted)/2,method:"SAME_PAGE_PERFORMANCE_CLOCK_ROUND_TRIP"};
  await page.evaluate(()=>{
    const rows=[],last={x:-Infinity,y:-Infinity,t:-Infinity};
    const selectorOf=(node)=>{if(!(node instanceof Element))return null;if(node.id)return "#"+CSS.escape(node.id);const path=[];for(let item=node;item&&item!==document.documentElement&&path.length<5;item=item.parentElement){const peers=item.parentElement?[...item.parentElement.children].filter((peer)=>peer.tagName===item.tagName):[];path.unshift(item.tagName.toLowerCase()+":nth-of-type("+(peers.indexOf(item)+1)+")");}return path.join(" > ");};
    const record=(event)=>{const time=event.timeStamp,x=event.clientX,y=event.clientY;if(event.type==="pointermove"&&Math.hypot(x-last.x,y-last.y)<2&&time-last.t<16)return;last.x=x;last.y=y;last.t=time;const node=event.target instanceof Element?event.target:null,rect=node?.getBoundingClientRect();rows.push({type:event.type,pagePerformanceTimeMs:time,pointerType:event.pointerType||"mouse",isTrusted:event.isTrusted,buttons:event.buttons,cssX:x,cssY:y,targetSelector:selectorOf(node),targetTag:node?.tagName?.toLowerCase()||null,targetId:node?.id||null,cursorCss:node?getComputedStyle(node).cursor:null,targetRect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null});};
    for(const type of ["pointermove","pointerdown","pointerup","click"])document.addEventListener(type,record,true);
    window.__a1NativePointerEventLog=rows;
  });
  cursorTelemetry.moves.push({tMs:0,x:pointer.x/width,y:pointer.y/height});events.push({name:"start",tMs:0});
  for(const operation of [...scenario.operations].sort((a,b)=>a.atMs-b.atMs)){
    await waitUntil(operation.atMs);const name=operation.name||operation.type;
    if(operation.type==="wait"){const waitStart=elapsed();await sleep(operation.ms||250);const waitEnd=elapsed();waitTelemetry.push({name,startMs:waitStart,endMs:waitEnd,durationMs:waitEnd-waitStart});events.push({name,tMs:waitEnd,type:"wait"});continue;}
    if(operation.type==='snapshot'){
      if(!/^[a-z0-9-]+$/i.test(name))throw new Error('SNAPSHOT_NAME_INVALID');
      const file=path.join(out,`${name}.png`);
      await page.screenshot({path:file});
      const text=operation.selector?await page.locator(operation.selector).innerText():null;
      events.push({name,type:'snapshot',tMs:elapsed(),path:path.relative(root,file),sha256:shaFile(file),text});continue;
    }
    if(operation.type==='type'){
      const locator=locatorFor(operation);await locator.focus();
      const typingStart=elapsed();events.push({name:`${name}-start`,type:'typing-start',tMs:typingStart});
      await page.keyboard.type(operation.text,{delay:operation.delayMs||50});
      if(operation.expectedText&&!((await locator.innerText()).includes(operation.expectedText)))throw new Error(`TYPED_TEXT_NOT_FOUND:${name}`);
      const typingEnd=elapsed();typingTelemetry.push({name,startMs:typingStart,endMs:typingEnd,durationMs:typingEnd-typingStart,charCount:String(operation.text||"").length,delayMs:Number(operation.delayMs||50)});await recordTarget(locator,name,operation.targetKind||"UI",operation.textRange||null);events.push({name,type:'typing-end',tMs:typingEnd});continue;
    }
    if(operation.type==="dragSelect"){
      const locator=locatorFor(operation);await locator.scrollIntoViewIfNeeded();await sleep(100);
      const {row}=await recordTarget(locator,name,"TEXT",operation.textRange),geometry=geometryTargets.find((target)=>target.targetKey===name),lineRects=geometry?.lineRectsCss||[];
      if(!row?.text?.includes(String(operation.textRange||""))||!lineRects.length)throw new Error(`NATIVE_DRAG_TARGET_GEOMETRY_MISSING:${name}`);
      const first=lineRects[0],last=lineRects.at(-1),from={x:first.x+Math.min(1,first.width/4),y:first.y+first.height/2},to={x:last.x+last.width-Math.min(1,last.width/4),y:last.y+last.height/2};
      await glide(from,operation.approachDurationMs||240);await page.mouse.move(from.x,from.y);await page.mouse.down();cursorTelemetry.clicks.push({tMs:elapsed(),x:from.x/width,y:from.y/height,down:true,event:name});
      const selectionStartMs=elapsed(),dragDurationMs=operation.durationMs||850,steps=Math.max(16,Math.round(dragDurationMs/30)),selectionSamples=[],sampleEvery=Math.max(1,Math.ceil(steps/7));
      const targetRect={x:Math.min(first.x,last.x),y:Math.min(first.y,last.y),width:Math.max(first.x+first.width,last.x+last.width)-Math.min(first.x,last.x),height:Math.max(first.y+first.height,last.y+last.height)-Math.min(first.y,last.y)};
      const clickAtMs=elapsed();clickTargetProof.push({event:name,clickAtMs,pointerCss:{x:from.x,y:from.y},pointerNormalized:{x:from.x/width,y:from.y/height},targetRectCss:targetRect,insideTarget:from.x>=targetRect.x&&from.x<=targetRect.x+targetRect.width&&from.y>=targetRect.y&&from.y<=targetRect.y+targetRect.height,centerErrorPx:0,action:"pointerdown_then_native_text_drag"});
      for(let index=1;index<=steps;index++){const progress=index/steps;pointer={x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress};await page.mouse.move(pointer.x,pointer.y,{steps:1});const tMs=elapsed();cursorTelemetry.moves.push({tMs,x:pointer.x/width,y:pointer.y/height});dragTelemetry.push({event:name,tMs,x:pointer.x/width,y:pointer.y/height,progress,buttonsDown:true});if(index%sampleEvery===0||index===steps){const selectedText=await page.evaluate(()=>String(window.getSelection()?.toString()||""));selectionSamples.push({tMs,selectedLength:selectedText.length,selectedSha256:selectedText?shaValue(selectedText):null});}}
      await page.mouse.up();cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:false,event:name});
      const selection=await page.evaluate(()=>({text:String(window.getSelection()?.toString()||""),collapsed:window.getSelection()?.isCollapsed??true}));
      if(selection.text!==String(operation.textRange||"")||selection.collapsed)throw new Error(`NATIVE_TEXT_DRAG_SELECTION_MISMATCH:${name}:${JSON.stringify({selectedLength:selection.text.length,expectedLength:String(operation.textRange||"").length})}`);
      const sourceTextSha256=crypto.createHash("sha256").update(selection.text).digest("hex"),proof={contract:"A1NativeBrowserTextDrag/v1",event:name,sourceTextSha256,selectedLength:selection.text.length,startMs:selectionStartMs,endMs:elapsed(),mouseDownDurationMs:elapsed()-selectionStartMs,pointCount:steps,buttonHeldDuringAllMoves:true,nativeSelectionVerified:true,selectionSamples,from,to,targetRectCss:targetRect};dragSelectionProofs.push(proof);events.push({name,type:"native-text-drag-selection",tMs:proof.endMs,sourceTextSha256,selectedLength:proof.selectedLength,mouseDownDurationMs:proof.mouseDownDurationMs});
      if(operation.resultSelector)await page.locator(operation.resultSelector).first().waitFor({state:"visible",timeout:15000});continue;
    }
    if(operation.type==="deleteText"||operation.type==="replaceText"){
      const locator=locatorFor(operation);await locator.scrollIntoViewIfNeeded();await locator.focus();
      const {box}=await recordTarget(locator,`${name}-before`,operation.targetKind||"TEXT",operation.textRange||null);
      await glide({x:box.x+box.width/2,y:box.y+box.height/2},operation.durationMs||360);
      const selection=await locator.evaluate((node,needle)=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let match=null;while(walker.nextNode()){const text=walker.currentNode.textContent||"",index=text.indexOf(needle||"");if(index>=0){match={node:walker.currentNode,index};break;}}if(!match)return{selected:"",found:false};const range=document.createRange();range.setStart(match.node,match.index);range.setEnd(match.node,match.index+(needle||"").length);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);return{selected:sel.toString(),found:true};},operation.textRange||"");
      if(!selection.found||selection.selected!==String(operation.textRange||""))throw new Error(`DELETE_TEXT_SELECTION_FAILED:${name}`);
      const editStart=elapsed(),replacement=String(operation.replacement||"");events.push({name:`${name}-start`,type:operation.type==="replaceText"?"text-replace-start":"text-delete-start",tMs:editStart,text:selection.selected,replacement});
      if(operation.type==="replaceText")await page.keyboard.type(replacement,{delay:operation.delayMs||45});else await page.keyboard.press(operation.key||"Backspace");
      await sleep(operation.afterMs||180);const afterText=await locator.innerText();if(operation.expectedAbsent&&afterText.includes(operation.expectedAbsent))throw new Error(`TEXT_EDIT_NOT_APPLIED:${name}`);if(operation.expectedText&&!afterText.includes(operation.expectedText))throw new Error(`TEXT_REPLACEMENT_NOT_FOUND:${name}`);
      const editEnd=elapsed();editTelemetry.push({name,startMs:editStart,endMs:editEnd,durationMs:editEnd-editStart,text:selection.selected,replacement,expectedAbsent:operation.expectedAbsent||null,expectedText:operation.expectedText||null});events.push({name:`${name}-end`,type:operation.type==="replaceText"?"text-replace-end":"text-delete-end",tMs:editEnd});continue;
    }
    if(operation.type==="observe"){
      const locator=locatorFor(operation);
      await locator.waitFor({state:"visible",timeout:15000});
      await recordTarget(locator,name,operation.targetKind||"UI",operation.textRange||null);
      events.push({name,tMs:elapsed(),type:"observation"});
      continue;
    }
    if(operation.type==="scroll"){
      const target=locatorFor(operation),scrollStart=await page.evaluate(()=>scrollY),scrollEnd=await target.evaluate((node)=>Math.max(0,scrollY+node.getBoundingClientRect().top-Math.round(innerHeight*.16))),scrollDuration=operation.durationMs||900,steps=Math.max(18,Math.round(scrollDuration/16));
      events.push({name:`${name}-scroll-start`,type:"scroll-start",tMs:elapsed(),fromY:scrollStart,toY:scrollEnd,durationMs:scrollDuration});
      let previousY=scrollStart,previousT=elapsed();
      for(let index=1;index<=steps;index+=1){const raw=index/steps,eased=6*raw**5-15*raw**4+10*raw**3;await page.evaluate((value)=>scrollTo(0,value),scrollStart+(scrollEnd-scrollStart)*eased);const currentY=await page.evaluate(()=>scrollY),currentT=elapsed(),dt=Math.max(1,currentT-previousT);scrollTelemetry.push({event:name,tMs:currentT,scrollY:currentY,progress:raw,easedProgress:eased,velocityPxPerMs:(currentY-previousY)/dt});previousY=currentY;previousT=currentT;await sleep(scrollDuration/steps);}
      const settledY=await page.evaluate(()=>scrollY);scrollTelemetry.push({event:name,tMs:elapsed(),scrollY:settledY,progress:1,easedProgress:1,velocityPxPerMs:0,settled:true});events.push({name:`${name}-scroll-settled`,type:"scroll-settled",tMs:elapsed(),scrollY:settledY});
      const {box}=await recordTarget(target,name,operation.targetKind||"UI",operation.textRange||null);await glide({x:Math.min(width-40,Math.max(40,box.x+box.width*.5)),y:Math.min(height-40,Math.max(40,box.y+Math.min(box.height*.5,height*.35)))},320);events.push({name,tMs:elapsed(),type:"scroll-target"});continue;
    }
    if(operation.type==="drag"){
      const source=locatorFor(operation),destination=page.locator(operation.targetSelector).first(),sourceEvidence=await recordTarget(source,`${name}-source`,operation.targetKind||"UI"),dropEvidence=await recordTarget(destination,`${name}-drop`,"REGION"),from={x:sourceEvidence.box.x+sourceEvidence.box.width/2,y:sourceEvidence.box.y+sourceEvidence.box.height/2},to={x:dropEvidence.box.x+dropEvidence.box.width/2,y:dropEvidence.box.y+dropEvidence.box.height/2},dragDuration=operation.durationMs||1200,steps=Math.max(24,Math.round(dragDuration/16));
      await glide(from,320);events.push({name:`${name}-start`,type:"drag-start",tMs:elapsed(),from:{x:from.x/width,y:from.y/height},to:{x:to.x/width,y:to.y/height}});cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:true,event:name});await page.mouse.down();
      for(let index=1;index<=steps;index+=1){const raw=index/steps,eased=6*raw**5-15*raw**4+10*raw**3;pointer={x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased};await page.mouse.move(pointer.x,pointer.y,{steps:1});const row={event:name,tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,progress:raw,easedProgress:eased};cursorTelemetry.moves.push({tMs:row.tMs,x:row.x,y:row.y});dragTelemetry.push(row);await sleep(dragDuration/steps);}
      await page.mouse.up();cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:false,event:name});events.push({name:`${name}-drop`,type:"drag-drop",tMs:elapsed(),x:pointer.x/width,y:pointer.y/height});if(operation.resultSelector)await page.locator(operation.resultSelector).first().waitFor({state:"visible",timeout:15000});continue;
    }
    if(operation.type==="fileDrop"){
      const locator=locatorFor(operation);await locator.waitFor({state:"visible",timeout:15000});const {box}=await recordTarget(locator,`${name}-target`,operation.targetKind||"DROP_ZONE");
      const from={x:pointer.x,y:pointer.y},to={x:box.x+box.width/2,y:box.y+box.height/2},duration=operation.durationMs||1200,steps=Math.max(24,Math.round(duration/16));
      const fileBuffer=fs.readFileSync(path.resolve(root,operation.file));const base64=fileBuffer.toString("base64");
      await page.evaluate(({selector,data,name,mime})=>{const node=document.querySelector(selector);if(!node)throw new Error("FILE_DROP_TARGET_MISSING");const bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0));const file=new File([bytes],name,{type:mime});const transfer=new DataTransfer();transfer.items.add(file);window.__a1FileDropTransfer=transfer;}, {selector:operation.selector,data:base64,name:operation.fileName||path.basename(operation.file),mime:operation.mimeType||"video/mp4"});
      events.push({name:`${name}-start`,type:"file-drag-start",tMs:elapsed(),from:{x:from.x/width,y:from.y/height},to:{x:to.x/width,y:to.y/height},fileName:operation.fileName||path.basename(operation.file)});cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:true,event:name});
      for(let index=1;index<=steps;index+=1){const raw=index/steps,eased=6*raw**5-15*raw**4+10*raw**3;pointer={x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased};await page.mouse.move(pointer.x,pointer.y,{steps:1});await page.evaluate(({selector})=>{const node=document.querySelector(selector);const transfer=window.__a1FileDropTransfer;node.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:transfer}));}, {selector:operation.selector});const row={event:name,tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,progress:raw,easedProgress:eased};cursorTelemetry.moves.push({tMs:row.tMs,x:row.x,y:row.y});dragTelemetry.push(row);await sleep(duration/steps);}
      await page.evaluate(({selector})=>{const node=document.querySelector(selector);const transfer=window.__a1FileDropTransfer;node.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));delete window.__a1FileDropTransfer;}, {selector:operation.selector});await page.mouse.move(to.x,to.y);cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:false,event:name});events.push({name:`${name}-drop`,type:"file-drop",tMs:elapsed(),fileName:operation.fileName||path.basename(operation.file)});if(operation.resultSelector)await page.locator(operation.resultSelector).first().waitFor({state:operation.resultState||"visible",timeout:15000});continue;
    }
    if(operation.type==="retry"){
      for(const attempt of operation.attempts||[]){
        const attemptStart=elapsed();
        try{
          const locator=locatorFor(attempt);await locator.waitFor({state:"visible",timeout:attempt.timeoutMs||900});const {box}=await recordTarget(locator,`${name}-${attempt.id}`,attempt.targetKind||"UI");await glide({x:box.x+box.width/2,y:box.y+box.height/2},attempt.moveMs||240);if(attempt.type==="click"){cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:true,event:`${name}-${attempt.id}`});await locator.click({delay:70});cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:false,event:`${name}-${attempt.id}`});}if(attempt.resultSelector)await page.locator(attempt.resultSelector).first().waitFor({state:"visible",timeout:15000});const attemptEnd=elapsed();events.push({name:`${name}-${attempt.id}`,type:"retry-attempt-succeeded",tMs:attemptEnd});retryIntervals.push({name,attemptId:attempt.id,startMs:attemptStart,endMs:attemptEnd,durationMs:attemptEnd-attemptStart,status:"SUCCEEDED"});
        }catch(error){const attemptEnd=elapsed();events.push({name:`${name}-${attempt.id}`,type:"retry-attempt-failed",tMs:attemptEnd,error:String(error).slice(0,180)});retryIntervals.push({name,attemptId:attempt.id,startMs:attemptStart,endMs:attemptEnd,durationMs:attemptEnd-attemptStart,status:"FAILED",error:String(error).slice(0,180)});}
      }
      continue;
    }
    const locator=locatorFor(operation);await locator.scrollIntoViewIfNeeded();await sleep(80);const {box}=await recordTarget(locator,name,operation.targetKind||"UI",operation.textRange||null),target={x:box.x+box.width/2,y:box.y+box.height/2};await glide(target,operation.durationMs||360);if(operation.type==="click")await recordClickTarget(locator,name);
    if(operation.type==="hover"){if(operation.force!==true)await locator.hover();}
    else if(operation.type==="click"){cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:true,event:name});await locator.click({delay:70});cursorTelemetry.clicks.push({tMs:elapsed(),x:pointer.x/width,y:pointer.y/height,down:false,event:name});}
    else if(operation.type==="press"){await locator.focus();await page.keyboard.press(operation.key);}
    else throw new Error(`generic-screen-operation-unsupported:${operation.type}`);
    events.push({name,tMs:elapsed()});if(operation.resultSelector)await page.locator(operation.resultSelector).first().waitFor({state:"visible",timeout:15000});
  }
  if(scenario.resultSelector){const result=page.locator(scenario.resultSelector).first();await result.waitFor({state:"visible",timeout:15000});await recordTarget(result,"result_hold",scenario.resultTargetKind||"UI");events.push({name:"result_hold",tMs:elapsed()});}
  sourcePointerEvents=await page.evaluate(()=>window.__a1NativePointerEventLog||[]);
  sourcePointerEvents=sourcePointerEvents.map((event)=>({...event,captureTimeMs:Math.round(event.pagePerformanceTimeMs-sourcePointerTimeOrigin.pagePerformanceNowMs+sourcePointerTimeOrigin.captureElapsedAtAnchorMs)}));
  const inputEventFor=(sample,type)=>sourcePointerEvents.filter((event)=>event.type===type&&event.isTrusted&&event.pointerType==="mouse"&&Math.hypot(event.cssX-sample.x*width,event.cssY-sample.y*height)<1).sort((a,b)=>Math.abs(a.captureTimeMs-sample.tMs)-Math.abs(b.captureTimeMs-sample.tMs))[0];
  for(const click of cursorTelemetry.clicks){const originalTimeMs=click.tMs,source=inputEventFor(click,click.down?"pointerdown":"pointerup");if(!source||Math.abs(source.captureTimeMs-originalTimeMs)>120)throw new Error(`CURSOR_CLICK_SOURCE_BINDING_FAILED:${click.event}:${click.down}`);click.originalScriptTimeMs=originalTimeMs;click.tMs=source.captureTimeMs;click.x=source.cssX/width;click.y=source.cssY/height;click.sourcePointerType=source.type;}
  for(const proof of clickTargetProof){const scripted=cursorTelemetry.clicks.find((click)=>click.down&&click.event===proof.event);if(!scripted)throw new Error(`CURSOR_CLICK_PROOF_MISSING:${proof.event}`);proof.plannedClickAtMs=proof.clickAtMs;proof.clickAtMs=scripted.tMs;proof.clickClockCorrectionMs=proof.clickAtMs-proof.plannedClickAtMs;}
  await waitUntil(durationMs);events.push({name:"end",tMs:elapsed()});console.error(`[capture:${scenario.id}] end-event`);const finalized=await video.path();console.error(`[capture:${scenario.id}] video-path`);await context.close();console.error(`[capture:${scenario.id}] context-closed`);await fsp.copyFile(finalized,rawPath);console.error(`[capture:${scenario.id}] raw-copied`);await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);console.error(`[capture:${scenario.id}] browser-close-settled`);browser=null;
}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
const rawProbe=JSON.parse(execFileSync(ffprobe,["-v","error","-show_entries","format=duration","-of","json",rawPath],{encoding:"utf8"}));
const rawDuration=Number(rawProbe.format.duration),wallDuration=events.at(-1).tMs/1000,tailOffsetMs=Math.max(0,(rawDuration-wallDuration)*1000);
const syncWidth=80,syncHeight=45,frameBytes=syncWidth*syncHeight*3;
const syncFrames=execFileSync(ffmpeg,["-v","error","-i",rawPath,"-vf","fps=25,scale=80:45,format=rgb24","-f","rawvideo","-pix_fmt","rgb24","-"],{maxBuffer:32*1024*1024});
let lastMarker=-1,markerFrames=0;
for(let i=0;i<Math.floor(syncFrames.length/frameBytes);i++){
  let matched=0;
  for(let p=0;p<frameBytes;p+=3){const offset=i*frameBytes+p;if(syncFrames[offset]>220&&syncFrames[offset+1]<35&&syncFrames[offset+2]>220)matched++;}
  if(matched/(syncWidth*syncHeight)>.97){lastMarker=i;markerFrames++;}
}
if(lastMarker<0||markerFrames<3)throw new Error("CAPTURE_SYNC_MARKER_MISSING");
const rawSyncMs=(lastMarker+1)*40,syncPass=true,startOffset=rawSyncMs/1000,targetSeconds=durationMs/1000,syncMode="PRE_ROLL_MARKER_END",syncRegionDescriptors=[],bestSync={mse:null};
if(rawDuration-startOffset<targetSeconds-.16)throw new Error("CAPTURE_TOO_SHORT_AFTER_SYNC");
execFileSync(ffmpeg,["-v","error","-y","-ss",String(startOffset),"-i",rawPath,"-t",String(targetSeconds),"-vf","fps=60,tpad=stop_mode=clone:stop_duration=0.4","-an","-c:v","h264_videotoolbox","-b:v","12M","-pix_fmt","yuv420p","-r","60","-vsync","cfr","-movflags","+faststart",cleanPath]);
const probe=JSON.parse(execFileSync(ffprobe,["-v","error","-count_frames","-show_entries","stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration","-of","json",cleanPath],{encoding:"utf8"})),stream=probe.streams.find((item)=>item.codec_type==="video"),decode=spawnSync(ffmpeg,["-v","error","-i",cleanPath,"-f","null","-"],{encoding:"utf8"});if(decode.status!==0||stream.width!==width||stream.height!==height||stream.r_frame_rate!=="60/1")throw new Error(`generic-screen-output-invalid:${JSON.stringify(probe)}`);
execFileSync(ffmpeg,["-v","error","-y","-i",cleanPath,"-vf",`fps=3/${targetSeconds},scale=480:270,tile=3x1`,`-frames:v`,`1`,contactPath]);
const gitAfter=gitState();if(gitAfter!==gitBefore)throw new Error("generic-screen-target-project-mutated");const primaryEvent=scenario.primaryEvent||events.find((item)=>!['start','end'].includes(item.name))?.name,primaryTarget=domTargets.find((item)=>item.event===primaryEvent)||domTargets.at(-1)||null;
const geometryFrame=buildScreenGeometryFrame({sourceWidth:stream.width,sourceHeight:stream.height,viewportCss:geometryRuntime?.viewportCss||{x:0,y:0,width,height},captureRectCss:geometryRuntime?.viewportCss||{x:0,y:0,width,height},devicePixelRatio:geometryRuntime?.devicePixelRatio||1,pageZoom:geometryRuntime?.pageZoom||1,visualViewport:geometryRuntime?.visualViewport||null,scroll:geometryRuntime?.scroll||{x:0,y:0},screenshotScale:"device",pointPixelScale:{x:stream.width/(geometryRuntime?.viewportCss?.width||width),y:stream.height/(geometryRuntime?.viewportCss?.height||height)},frameId:`${scenario.id}-frame-0`});
const geometryTruth=geometryFrame?.contract==="A1ScreenGeometryFrame/v2"?compileScreenGeometryTruth({sourceSha256:shaFile(cleanPath),source:{width:stream.width,height:stream.height},frame:geometryFrame,targets:geometryTargets}):geometryFrame;
if(Math.abs(Number(probe.format.duration)*1000-durationMs)>100)throw new Error("CAPTURE_DURATION_MISMATCH");
if(geometryTruth.status!=="PASS_REVIEW_ONLY")throw new Error("CAPTURE_GEOMETRY_REJECTED");
const report={contract:"A1GenericBrowserScreenProof/v1",status:"READY_FOR_CAP_REVIEW",scenarioId:scenario.id,productId:scenario.productId,productCategory:scenario.productCategory||"unknown",scenarioSha256:shaValue(scenario),runtimeId:"GENERIC_BROWSER_CAPTURE_V1",captureBackend:"PLAYWRIGHT_HEADLESS_RECORD_VIDEO",captureScope:"BROWSER_PAGE_VIEWPORT_ONLY",headedWindowCreated:false,frontmostApplicationMutation:false,cursorPixelPolicy:"CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS",sourcePointerReplay:{contract:"A1CapSourcePointerReplay/v1",capturePixelsExcludeCursor:true,renderStage:"CAP_NATIVE_CURSOR_LAYER",pathSource:"TRUSTED_BROWSER_POINTER_EVENTS",interpolation:"RAW_CAPTURED_EVENT_POINTS",clock:"SAME_PAGE_PERFORMANCE_CLOCK_ROUND_TRIP",sourcePointerTimeOrigin},url:scenario.url,sourcePointerTimeOrigin,sourcePointerEvents,directorPlan:scenario.directorPlan||null,project:{root:projectRoot,verificationScope:hasGit?"TRACKED_GIT_STATUS":"EXPLICIT_SOURCE_FILES_ONLY",sourceFiles:scenario.sourceFiles||[],gitHead,gitStateSha256:crypto.createHash("sha256").update(gitBefore).digest("hex"),unchanged:gitAfter===gitBefore},events,cursorTelemetry,scrollTelemetry,dragTelemetry,retryIntervals,typingTelemetry,editTelemetry,waitTelemetry,domTargets,clickTargetProof,dragSelectionProofs,geometryTruth,captureSync:{contract:"A1VideoFrameSync/v1",method:syncMode,syncFramePath:path.relative(root,syncFramePath),syncRegions:syncRegionDescriptors,searchFps:25,rawDurationMs:Math.round(rawDuration*1000),pageWallDurationMs:Math.round(wallDuration*1000),tailOffsetMs:Math.round(tailOffsetMs),rawSyncMs:Math.round(rawSyncMs),pixelMse:bestSync.mse,syncPass,sourceTimeOrigin:"FIRST_FRAME_AFTER_PRE_ROLL_MARKER",markerFrames,syncResolutionMs:40},primaryTarget,output:{path:path.relative(root,cleanPath),sha256:shaFile(cleanPath),width:stream.width,height:stream.height,fps:stream.r_frame_rate,frameCount:Number(stream.nb_read_frames),durationMs:Math.round(Number(probe.format.duration)*1000),fullDecodePass:decode.status===0},evidence:{contactSheet:path.relative(root,contactPath),contactSheetSha256:shaFile(contactPath)},boundary:{reviewOnly:true,targetProjectMutation:false,currentStoryboardMutationPerformed:false,productionAdmission:false},generatedAt:new Date().toISOString()};report.reportSha256=shaValue(report);fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({...report,reportPath:path.relative(root,reportPath)},null,2));
process.exit(0);
