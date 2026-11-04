#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const publicRoot=path.join(appRoot,"public");
const relativeRoot="full-static-storyboard-rework-v4";
const outputRoot=path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1",relativeRoot);
const expectedWorkspaceSha256=process.argv[2];
const rootRequire=createRequire(path.join(root,"package.json"));
const appRequire=createRequire(path.join(appRoot,"package.json"));
const sharp=appRequire("sharp");
const fontkit=rootRequire("fontkit");
const sha=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value)||typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shaFile=(file)=>sha(fs.readFileSync(file));
const publicPath=(url)=>path.join(publicRoot,url.replace(/^\//u,""));
const publicUrl=(file)=>`/${path.relative(publicRoot,file).split(path.sep).join("/")}`;
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||""))) throw new Error("full-static-storyboard-workspace-sha-required");
const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if(current.workspaceSha256!==expectedWorkspaceSha256) throw new Error(`full-static-storyboard-workspace-cas:${current.workspaceSha256}`);
if(!["build-full-static-storyboard-rework","compile-current-visual-decision-ledger","review-full-static-storyboard-rework"].includes(current.production.authority?.nextAction?.id)||!["FULL_STATIC_STORYBOARD_REWORK_REQUIRED","READY_FOR_FULL_STATIC_STORYBOARD_REVIEW"].includes(current.production.staticStoryboardRework?.status)) throw new Error("full-static-storyboard-rework-authority-required");
const board=current.production.shotIntelligence.wholeFilmStaticBoard;
const timeline=[...board.timelineBoard.items].sort((a,b)=>a.order-b.order);
const packageByShot=new Map(board.items.map((item)=>[item.shotId,item]));
if(timeline.length!==34) throw new Error(`full-static-storyboard-shot-count:${timeline.length}`);
fs.mkdirSync(outputRoot,{recursive:true});

const focusSequence=[{x:.08,y:.08,width:.84,height:.48},{x:.18,y:.18,width:.72,height:.58},{x:.08,y:.28,width:.82,height:.58},{x:.22,y:.05,width:.70,height:.62}];
const openingTitleFile=path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/state-a-fullscreen-title.png");
const ed31BaseFile=path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg");
const ed07BaseFile=path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-07.jpg");
const ed19BaseFile=path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-19-hold-frame.jpg");
const fontFile=path.join(publicRoot,"a1-editorial-fonts/fusion-pixel.ttf");
const font=fontkit.create(fs.readFileSync(fontFile));
const glyphLine=({text,x,y,size,fill})=>{const scale=size/font.unitsPerEm;let cursor=x;const paths=[];for(const character of [...text]){const run=font.layout(character);const glyph=run.glyphs[0],position=run.positions[0];if(!glyph||glyph.id===0)throw new Error(`full-static-storyboard-glyph-missing:${character}`);const d=glyph.path.toSVG();if(d)paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);cursor+=position.xAdvance*scale+2;}return `<g fill="${fill}">${paths.join("")}</g>`;};
const screenChapters=[{id:"CH-01",label:"写作操作",shotIds:["ED-02","ED-03","ED-04","ED-05","ED-06"]},{id:"CH-02",label:"后台编排",shotIds:["ED-20","ED-21","ED-22","ED-23"]},{id:"CH-03",label:"版本与建议",shotIds:["ED-24","ED-25","ED-26","ED-27"]},{id:"CH-04",label:"收稿与演示",shotIds:["ED-28","ED-29","ED-30"]}];
const renderPresenterPackage=async(shotId)=>{const file=shotId==="ED-07"?ed07BaseFile:ed19BaseFile;if(!fs.existsSync(file))throw new Error(`full-static-storyboard-presenter-base-missing:${shotId}`);const base=await sharp(file).resize(960,540,{fit:"cover"}).png().toBuffer();const content=shotId==="ED-07"?`${glyphLine({text:"直接写完",x:76,y:196,size:68,fill:"#f3f1e9"})}${glyphLine({text:"全文？",x:74,y:312,size:104,fill:"#f3f1e9"})}<path d="M76 346H430" stroke="#2452ff" stroke-width="5"/><circle cx="448" cy="346" r="10" fill="#dfff68"/>`:`${glyphLine({text:"Codex 在后台",x:72,y:150,size:48,fill:"#f3f1e9"})}${glyphLine({text:"整理",x:92,y:236,size:34,fill:"#2452ff"})}${glyphLine({text:"编排",x:92,y:296,size:34,fill:"#f3f1e9"})}${glyphLine({text:"读取",x:92,y:356,size:34,fill:"#f3f1e9"})}${glyphLine({text:"检查",x:92,y:416,size:34,fill:"#2452ff"})}<path d="M68 198V430" stroke="#2452ff" stroke-width="4" stroke-dasharray="9 9"/><circle cx="68" cy="222" r="7" fill="#dfff68"/><circle cx="68" cy="282" r="7" fill="#2452ff"/><circle cx="68" cy="342" r="7" fill="#2452ff"/><circle cx="68" cy="402" r="7" fill="#dfff68"/>`;const panelWidth=shotId==="ED-07"?690:500;const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#070b0e" stop-opacity=".92"/><stop offset=".68" stop-color="#070b0e" stop-opacity=".42"/><stop offset="1" stop-color="#070b0e" stop-opacity="0"/></linearGradient></defs><rect width="${panelWidth}" height="540" fill="url(#g)"/><rect x="42" y="100" width="7" height="330" fill="#2452ff"/>${content}</svg>`);return sharp(base).composite([{input:overlay,left:0,top:0}]).png().toBuffer();};
const renderEd31=async()=>{if(!fs.existsSync(ed31BaseFile))throw new Error("full-static-storyboard-ed31-base-missing");const base=await sharp(ed31BaseFile).resize(960,540,{fit:"cover"}).png().toBuffer();const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="40" y="86" width="400" height="330" fill="#070b0e" fill-opacity=".86"/><path d="M40 86H440V416H40Z" fill="none" stroke="#2452ff" stroke-width="4"/><rect x="40" y="86" width="400" height="28" fill="#2452ff"/><rect x="398" y="94" width="12" height="12" fill="#dfff68"/>${glyphLine({text:"可控的",x:76,y:218,size:60,fill:"#f3f1e9"})}${glyphLine({text:"工作流",x:72,y:350,size:104,fill:"#f3f1e9"})}<path d="M76 382H414" stroke="#dfff68" stroke-width="5"/><text x="58" y="106" fill="#f3f1e9" font-family="monospace" font-size="13">CONTROL / CURRENT</text></svg>`);return sharp(base).composite([{input:overlay,left:0,top:0}]).png().toBuffer();};
const renderEd12=async()=>{
  const labels=["GPT","CLAUDE","KIMI","DEEPSEEK","智谱"];
  const rows=labels.map((label,index)=>{const y=112+index*72;const color=index===2?"#dfff68":"#2452ff";return `<path d="M350 ${y}H420" stroke="${color}" stroke-width="4"/><rect x="420" y="${y-25}" width="470" height="50" fill="#101619" stroke="${color}" stroke-width="3"/>${glyphLine({text:label,x:444,y:y+13,size:30,fill:"#f3f1e9"})}<path d="M650 ${y}h${90+index*22}" stroke="#aebbb7" stroke-width="8" stroke-dasharray="12 8"/>`;}).join("");
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#0d1215"/><rect x="54" y="72" width="272" height="396" fill="#f3f1e9"/><rect x="54" y="72" width="272" height="32" fill="#2452ff"/><text x="70" y="94" fill="#f3f1e9" font-family="monospace" font-size="15">ONE SOURCE / FIVE READS</text>${glyphLine({text:"同一段素材",x:82,y:198,size:44,fill:"#101619"})}${glyphLine({text:"五个模型",x:80,y:286,size:60,fill:"#2452ff"})}<path d="M82 326H286" stroke="#101619" stroke-width="4"/><path d="M82 356H242M82 382H270M82 408H212" stroke="#909a9e" stroke-width="10" stroke-dasharray="16 8"/>${rows}</svg>`);
  return sharp(svg).png().toBuffer();
};
const renderEd14=async(base)=>{
  const paper=await sharp(base).extract({left:28,top:40,width:500,height:460}).resize(560,500,{fit:"contain",background:"#f3f1e9"}).png().toBuffer();
  const field=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#eef1f3"/><rect x="0" width="574" height="540" fill="#f3f1e9"/><rect x="574" width="386" height="540" fill="#101619"/><rect x="574" width="386" height="30" fill="#2452ff"/><text x="592" y="21" fill="#f3f1e9" font-family="monospace" font-size="13">OBSERVED → BOUND</text>${glyphLine({text:"句法趋同",x:612,y:132,size:34,fill:"#f3f1e9"})}${glyphLine({text:"词汇趋同",x:612,y:218,size:34,fill:"#f3f1e9"})}<path d="M612 158H840M612 244H790" stroke="#2452ff" stroke-width="6" stroke-dasharray="12 8"/><path d="M706 278V338L662 382H620" fill="none" stroke="#dfff68" stroke-width="5"/>${glyphLine({text:"表达范围",x:612,y:432,size:38,fill:"#f3f1e9"})}${glyphLine({text:"可能变窄",x:612,y:484,size:38,fill:"#2452ff"})}</svg>`);
  return sharp(field).composite([{input:paper,left:8,top:20}]).png().toBuffer();
};
const renderEd34=async(base)=>{
  const ed17=packageByShot.get("ED-17");const ed17Url=ed17?.artifactPublicUrl||ed17?.previewPublicUrl;const ed17File=ed17Url?publicPath(ed17Url):null;
  if(!ed17File||!fs.existsSync(ed17File))throw new Error("full-static-storyboard-ed34-ed17-machine-source-missing");
  const machine=await sharp(ed17File).resize(960,540,{fit:"cover"}).extract({left:0,top:300,width:960,height:240}).modulate({brightness:1.08,saturation:.72}).png().toBuffer();
  const fingerprint=await sharp(base).extract({left:700,top:100,width:220,height:310}).resize(176,248,{fit:"contain",background:{r:243,g:241,b:233,alpha:0}}).png().toBuffer();
  const canvas=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f3f1e9"/><path d="M0 96H960" stroke="#cbd1d4" stroke-width="2" stroke-dasharray="3 9"/>${glyphLine({text:"真正写出",x:64,y:166,size:54,fill:"#101619"})}${glyphLine({text:"自己的风格",x:62,y:252,size:70,fill:"#2452ff"})}<path d="M64 280H612" stroke="#2452ff" stroke-width="5"/><rect x="610" y="271" width="18" height="18" fill="#dfff68"/><path d="M710 160H770" stroke="#2452ff" stroke-width="4" stroke-dasharray="8 7"/></svg>`);
  return sharp(canvas).composite([{input:machine,left:0,top:300},{input:fingerprint,left:748,top:54}]).png().toBuffer();
};
const renderFrame=async(item)=>{
  if(item.shotId==="ED-01"){
    if(!fs.existsSync(openingTitleFile))throw new Error("full-static-storyboard-ed01-title-missing");
    return sharp(openingTitleFile).resize(960,540,{fit:"cover"}).png().toBuffer();
  }
  if(["ED-07","ED-19"].includes(item.shotId))return renderPresenterPackage(item.shotId);
  if(item.shotId==="ED-31")return renderEd31();
  const packageItem=packageByShot.get(item.shotId);
  const sourceUrl=packageItem?.artifactPublicUrl||packageItem?.previewPublicUrl||item.preview?.publicUrl||item.previewPublicUrl;
  const expectedSha256=packageItem?.artifactSha256||packageItem?.previewSha256||item.preview?.sha256||null;
  const sourceFile=publicPath(sourceUrl);
  if(!sourceUrl||!fs.existsSync(sourceFile)) throw new Error(`full-static-storyboard-source-missing:${item.shotId}`);
  if(expectedSha256&&shaFile(sourceFile)!==expectedSha256) throw new Error(`full-static-storyboard-source-sha:${item.shotId}`);
  const base=await sharp(sourceFile).resize(960,540,{fit:"cover"}).png().toBuffer();
  if(item.shotId==="ED-12")return renderEd12();
  if(item.shotId==="ED-14")return renderEd14(base);
  if(item.shotId==="ED-34")return renderEd34(base);
  if(item.route!=="SCREEN_EVIDENCE") return base;
  const screenIndex=timeline.filter((entry)=>entry.route==="SCREEN_EVIDENCE"&&entry.order<=item.order).length-1;
  const focus=focusSequence[screenIndex%focusSequence.length];
  const left=Math.round(focus.x*960),top=Math.round(focus.y*540),width=Math.round(focus.width*960),height=Math.round(focus.height*540);
  const crop=await sharp(base).extract({left,top,width:Math.min(width,960-left),height:Math.min(height,540-top)}).png().toBuffer();
  const chapter=screenChapters.find((candidate)=>candidate.shotIds.includes(item.shotId));
  const chapterStep=chapter?chapter.shotIds.indexOf(item.shotId):0;
  if(chapter?.id==="CH-02"){
    const detail=await sharp(crop).resize(650,430,{fit:"fill"}).png().toBuffer();
    const labels=["整理","编排","读取","检查"];
    const rail=labels.map((label,index)=>`${glyphLine({text:label,x:44,y:152+index*72,size:30,fill:index===chapterStep?"#dfff68":"#aebbb7"})}<circle cx="28" cy="${142+index*72}" r="6" fill="${index===chapterStep?"#dfff68":"#2452ff"}"/>`).join("");
    const shell=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#101619"/><rect x="0" width="280" height="540" fill="#0a0e11"/><rect x="280" y="55" width="650" height="430" fill="#f3f1e9" stroke="#2452ff" stroke-width="5"/><path d="M28 120V390" stroke="#2452ff" stroke-width="3" stroke-dasharray="7 8"/>${rail}<text x="28" y="54" fill="#f3f1e9" font-family="monospace" font-size="15">CODEX / BACKSTAGE</text></svg>`);
    return sharp(shell).composite([{input:detail,left:280,top:55}]).png().toBuffer();
  }
  if(chapter?.id==="CH-03"){
    const leftView=await sharp(base).resize(430,430,{fit:"cover"}).png().toBuffer();const rightView=await sharp(crop).resize(430,430,{fit:"cover"}).png().toBuffer();
    const shell=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#eef1f3"/><rect x="30" y="72" width="430" height="430" fill="#fff" stroke="#101619" stroke-width="3"/><rect x="500" y="72" width="430" height="430" fill="#fff" stroke="#2452ff" stroke-width="4"/><text x="30" y="48" fill="#101619" font-family="monospace" font-size="16">VERSION ${String(chapterStep+1).padStart(2,"0")}</text><path d="M464 282H494" stroke="#dfff68" stroke-width="8"/><path d="M484 270L498 282L484 294" fill="none" stroke="#dfff68" stroke-width="6"/></svg>`);
    return sharp(shell).composite([{input:leftView,left:30,top:72},{input:rightView,left:500,top:72}]).png().toBuffer();
  }
  if(chapter?.id==="CH-04"){
    const page=await sharp(crop).resize(780,438,{fit:"contain",background:"#fff"}).png().toBuffer();
    const shell=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f3f1e9"/><rect x="70" y="42" width="820" height="456" fill="#fff" stroke="#101619" stroke-width="3"/><rect x="70" y="42" width="820" height="28" fill="#2452ff"/><text x="88" y="62" fill="#f3f1e9" font-family="monospace" font-size="13">FINAL DRAFT / RECEIPT ${chapterStep+1}</text><path d="M102 510H${420+chapterStep*170}" stroke="#2452ff" stroke-width="6"/><rect x="${418+chapterStep*170}" y="501" width="18" height="18" fill="#dfff68"/></svg>`);
    return sharp(shell).composite([{input:page,left:90,top:70}]).png().toBuffer();
  }
  const mode=chapterStep%4;
  if(mode===0){const frame=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="18" y="18" width="924" height="504" fill="none" stroke="#2452ff" stroke-width="4"/><path d="M18 70V18H70 M890 18H942V70 M942 470V522H890 M70 522H18V470" fill="none" stroke="#dfff68" stroke-width="6"/></svg>`);return sharp(base).composite([{input:frame,left:0,top:0}]).png().toBuffer();}
  if(mode===1)return sharp(crop).resize(960,540,{fit:"fill"}).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="18" y="18" width="924" height="504" fill="none" stroke="#2452ff" stroke-width="5"/></svg>`),left:0,top:0}]).png().toBuffer();
  if(mode===2){const leftPanel=await sharp(base).resize(528,540,{fit:"cover"}).png().toBuffer();const rightPanel=await sharp(crop).resize(432,540,{fit:"cover"}).png().toBuffer();return sharp({create:{width:960,height:540,channels:4,background:"#eef1f3"}}).composite([{input:leftPanel,left:0,top:0},{input:rightPanel,left:528,top:0},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="520" width="8" height="540" fill="#2452ff"/><text x="552" y="48" fill="#2452ff" font-family="monospace" font-size="18" font-weight="700">DETAIL</text></svg>`),left:0,top:0}]).png().toBuffer();}
  const dimmed=await sharp(base).modulate({brightness:.55,saturation:.8}).png().toBuffer();return sharp(dimmed).composite([{input:crop,left,top},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="${left}" y="${top}" width="${Math.min(width,960-left)}" height="${Math.min(height,540-top)}" fill="none" stroke="#dfff68" stroke-width="7"/><text x="${left+18}" y="${Math.max(28,top-14)}" fill="#2452ff" font-family="monospace" font-size="17" font-weight="700">RESULT</text></svg>`),left:0,top:0}]).png().toBuffer();
};

const frames=[];
for(const item of timeline){
  const pixels=await renderFrame(item);
  const file=path.join(outputRoot,`${item.shotId}.png`);fs.writeFileSync(file,pixels);
  const kind=item.route==="SCREEN_EVIDENCE"?"FOCUSED_REAL_SCREEN":item.packageBoardItem?"FINAL_PACKAGE_FRAME":"CLEAN_PRESENTER_FRAME";
  const screenChapter=screenChapters.find((chapter)=>chapter.shotIds.includes(item.shotId));const screenStep=screenChapter?screenChapter.shotIds.indexOf(item.shotId)+1:null;
  frames.push({shotId:item.shotId,order:item.order,route:item.route,kind,sourceText:item.sourceText,publicUrl:publicUrl(file),sha256:shaFile(file),width:960,height:540,packageBoardItem:item.packageBoardItem===true,screenChapter:screenChapter?{id:screenChapter.id,label:screenChapter.label,step:screenStep,stepCount:screenChapter.shotIds.length}:null});
}

const tileWidth=480,imageHeight=270,labelHeight=68,headerHeight=122,columns=4;
const tiles=[];
for(const frame of frames){
  const image=await sharp(publicPath(frame.publicUrl)).resize(tileWidth,imageHeight,{fit:"fill"}).png().toBuffer();
  const accent=frame.kind==="FINAL_PACKAGE_FRAME"?"#ff5c35":frame.kind==="FOCUSED_REAL_SCREEN"?"#2452ff":"#6e7c82";
  const chapterLabel=frame.screenChapter?` · ${frame.screenChapter.id} ${frame.screenChapter.label} ${frame.screenChapter.step}/${frame.screenChapter.stepCount}`:"";
  const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0a0e11"/><rect width="7" height="100%" fill="${accent}"/><text x="18" y="27" fill="#f3f1e9" font-family="monospace" font-size="17" font-weight="700">${frame.shotId} · ${frame.kind}${chapterLabel}</text><text x="18" y="51" fill="#aebbb7" font-family="PingFang SC, sans-serif" font-size="12">${String(frame.sourceText).slice(0,34).replaceAll("&","&amp;").replaceAll("<","&lt;")}</text></svg>`);
  tiles.push(await sharp({create:{width:tileWidth,height:imageHeight+labelHeight,channels:4,background:"#0a0e11"}}).composite([{input:image,left:0,top:0},{input:label,left:0,top:imageHeight}]).png().toBuffer());
}
const rows=Math.ceil(frames.length/columns),boardWidth=columns*tileWidth,boardHeight=headerHeight+rows*(imageHeight+labelHeight);
const header=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${headerHeight}"><rect width="100%" height="100%" fill="#101619"/><text x="28" y="48" fill="#f3f1e9" font-family="PingFang SC, sans-serif" font-size="31" font-weight="700">第一期 34 镜完整静帧候选 · 全片重审</text><text x="28" y="83" fill="#b7c3bf" font-family="PingFang SC, sans-serif" font-size="16">红＝正式包装画面 · 蓝＝真实操作聚焦画面 · 灰＝干净真人画面 · 动画冻结</text><text x="28" y="108" fill="#ff5c35" font-family="monospace" font-size="13">STATIC FIRST · NO MOTION EXPANSION · REVIEW REQUIRED</text></svg>`);
const boardFile=path.join(outputRoot,"full-static-storyboard-34-shot.png");
await sharp({create:{width:boardWidth,height:boardHeight,channels:4,background:"#080b0d"}}).composite([{input:header,left:0,top:0},...tiles.map((input,index)=>({input,left:index%columns*tileWidth,top:headerHeight+Math.floor(index/columns)*(imageHeight+labelHeight)}))]).png().toFile(boardFile);
const builtAt=new Date().toISOString();
const counts={package:frames.filter((item)=>item.kind==="FINAL_PACKAGE_FRAME").length,screen:frames.filter((item)=>item.kind==="FOCUSED_REAL_SCREEN").length,presenter:frames.filter((item)=>item.kind==="CLEAN_PRESENTER_FRAME").length};
const reportBody={contract:"A1FullStaticStoryboardRework/v4",status:"READY_FOR_FULL_STATIC_STORYBOARD_REVIEW",sourceWorkspaceSha256:current.workspaceSha256,sourceApprovedBoardSha256:board.sha256,lockedOpeningThreeStateSha256:shaFile(path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/ED-01-opening-title-three-state-board.png")),shotCount:frames.length,counts,frames,screenChapters,board:{publicUrl:publicUrl(boardFile),sha256:shaFile(boardFile),width:boardWidth,height:boardHeight},qualityBoundary:{allShotsActualPixels:true,openingThreeStatePreserved:true,openingExactTypographyRebound:true,screenRunGroupedIntoFourChapters:true,screenRunCompositionFamilies:["WRITING_FOCUS","BACKSTAGE_SEQUENCE","VERSION_COMPARE","FINAL_RECEIPT"],ed07CurrentFusionPixelPackaging:true,ed19CurrentFusionPixelPackaging:true,ed31CurrentFusionPixelPackaging:true,ed12ModelComparisonRecomposed:true,ed14EvidenceMechanismRecomposed:true,ed34MechanicalWorldClosure:true,screenRunUsesFocusedRealSources:true,packageFramesUseCurrentSelectedPixels:true,presenterFramesUseVerifiedRealSources:true,motionFrozen:true,userVisualApproval:"PENDING"},builtAt};
const report={...reportBody,reportSha256:sha({...reportBody,builtAt:undefined})};
fs.writeFileSync(path.join(outputRoot,"report.json"),`${JSON.stringify(report,null,2)}\n`);
const binaryFiles={[`${relativeRoot}/${path.basename(boardFile)}`]:fs.readFileSync(boardFile),...Object.fromEntries(frames.map((frame)=>[`${relativeRoot}/${path.basename(publicPath(frame.publicUrl))}`,fs.readFileSync(publicPath(frame.publicUrl))]))};
const committed=withProjectLock(appRoot,()=>{
  const locked=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(locked.workspaceSha256!==current.workspaceSha256) throw new Error(`full-static-storyboard-persist-cas:${locked.workspaceSha256}`);
  let next=structuredClone(locked);
  if(next.production.currentVisualDecisionLedger?.current===true)next.production.currentVisualDecisionLedger={...next.production.currentVisualDecisionLedger,current:false,status:"SUPERSEDED_BY_FULL_STATIC_STORYBOARD_REWORK_V4",supersededByCandidateReportSha256:report.reportSha256};
  next.production.staticStoryboardRework={...next.production.staticStoryboardRework,status:report.status,candidate:{contract:report.contract,reportSha256:report.reportSha256,board:report.board,counts,targetShotIds:frames.map((item)=>item.shotId)},userVisualApproval:"PENDING",animationFrozen:true};
  next.production.motion.status="frozen-pending-full-static-storyboard-review";
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,builtAt));
  if(next.production.authority?.nextAction?.id!=="compile-current-visual-decision-ledger") throw new Error(`full-static-storyboard-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const event=createProductionEvent({workspace:locked,action:"build-full-static-storyboard-rework",targetId:report.reportSha256,payload:{status:report.status,reportSha256:report.reportSha256,boardSha256:report.board.sha256,shotCount:frames.length,counts,motionFrozen:true},now:builtAt});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  return persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:locked.workspaceSha256,commitId:`full-static-storyboard-${builtAt.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{[`${relativeRoot}/report.json`]:report},binaryFiles});
});
console.log(JSON.stringify({status:report.status,workspaceSha256After:committed.workspaceSha256,reportSha256:report.reportSha256,board:report.board,shotCount:frames.length,counts,motionFrozen:true},null,2));
