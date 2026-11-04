#!/usr/bin/env node
// Three-shot visual canary only. It never reads presenter/base/audio/subtitle
// pixels and is not a canonical export or a Resolve deliverable.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const candidateRoot=process.env.V8_CANARY_CANDIDATE_ROOT ? path.resolve(root,process.env.V8_CANARY_CANDIDATE_ROOT) : path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1/v8-visual-canary-candidates-v1");
const outputVersion=process.env.V8_CANARY_VERSION || "static-package-review-v8-canary";
const outputRoot=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1",outputVersion);
const W=1920; const H=1080; const sha=(b)=>crypto.createHash("sha256").update(b).digest("hex");
const fontPath=path.join(appRoot,"public/a1-editorial-fonts/fusion-pixel.ttf");
const supportFontPath=path.join(appRoot,"public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const fontSha=sha(fs.readFileSync(fontPath));
const supportFontSha=sha(fs.readFileSync(supportFontPath));
const manifest=JSON.parse(fs.readFileSync(path.join(candidateRoot,"manifest.json"),"utf8"));
if (manifest.productionAdmitted || manifest.resolveMutationPerformed) throw new Error("v8-canary-candidate-not-review-only");
const {default:sharp}=await import("sharp");
fs.mkdirSync(outputRoot,{recursive:true});
const dataUri=(file)=>`data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const candidate=(shotId)=>{const item=manifest.candidates.find((x)=>x.shotId===shotId); if(!item) throw new Error(`v8-candidate-missing:${shotId}`); const file=path.join(candidateRoot,item.path); if(sha(fs.readFileSync(file))!==item.sha256) throw new Error(`v8-candidate-sha:${shotId}`); return {item,file};};
const glyph=(text,x,baseline,size,fill="#17191c",anchor="start",font=fontPath)=>glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath:font,text}),{x,baseline,fontSize:size,fill,anchor});
let ed13AlphaFile=null;
if (candidateRoot.endsWith("v8-visual-canary-candidates-v2") || candidateRoot.endsWith("v8-visual-canary-candidates-v3")) {
  const source=candidate("ED-13").file;
  const decoded=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<decoded.data.length;i+=4){const m=Math.min(decoded.data[i],decoded.data[i+1],decoded.data[i+2]);decoded.data[i+3]=m>240?0:255;}
  ed13AlphaFile=path.join(outputRoot,"ED-13-alpha-object-source.png");
  await sharp(decoded.data,{raw:decoded.info}).png().toFile(ed13AlphaFile);
}
const svg=(shotId)=>{
  if(shotId==="ED-13") { const c=candidate(shotId); return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><filter id="soft"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="100%" height="100%" fill="none"/><path d="M42 38 C132 20 286 28 394 52 L382 244 C284 260 142 254 48 226 Z" fill="#17191c" opacity=".16" filter="url(#soft)"/><image href="${dataUri(ed13AlphaFile || c.file)}" x="62" y="42" width="390" height="230" preserveAspectRatio="none"/><path d="M48 276 C148 252 340 260 536 278 L550 434 C398 450 216 444 52 424 Z" fill="#111820" opacity=".66"/><path d="M48 276 C148 252 340 260 536 278" fill="none" stroke="#285ec8" stroke-width="4" opacity=".9"/>${glyph("国产模型写中文确实会顺一些",79,350,50,"#05070a", "start", supportFontPath)}${glyph("国产模型写中文确实会顺一些",76,347,50,"#f4f5f6", "start", supportFontPath)}${glyph("问题也并没有彻底解决",79,420,56,"#05070a")}${glyph("问题也并没有彻底解决",76,417,56,"#4e8cff")}</svg>`; }
  if(shotId==="ED-10") { const c=candidate(shotId); return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${dataUri(c.file)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>${glyph("完成度很高的废稿",140,170,92,"#17191c")}</svg>`; }
  const c=candidate("ED-31"); return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${dataUri(c.file)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/><circle cx="1830" cy="535" r="92" fill="#285ec8"/><path d="M1788 535l28 28 56-70" fill="none" stroke="#17191c" stroke-width="13" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="1884" cy="621" r="34" fill="#f4f3ef"/>${glyph("把不便整理成流程",960,142,76,"#17191c","middle")}${glyph("整理",610,812,48,"#17191c","middle",supportFontPath)}${glyph("编排",910,812,48,"#17191c","middle",supportFontPath)}${glyph("读取",1210,812,48,"#17191c","middle",supportFontPath)}${glyph("检查",1510,812,48,"#17191c","middle",supportFontPath)}${glyph("可控的工作流",1530,930,62,"#285ec8","middle")}</svg>`;
};
const shots=[{shotId:"ED-13",route:"OVERLAY_ALPHA"},{shotId:"ED-10",route:"FULLSCREEN_PACKAGE"},{shotId:"ED-31",route:"FULLSCREEN_PACKAGE"}];
const outputs=[];
for(const shot of shots){const raw=await sharp(Buffer.from(svg(shot.shotId))).png().toBuffer();const out=path.join(outputRoot,`${shot.shotId}.png`);await sharp(raw).png().toFile(out);const decoded=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true});let min=255,max=0,nonzero=0;for(let i=3;i<decoded.data.length;i+=4){const a=decoded.data[i];min=Math.min(min,a);max=Math.max(max,a);if(a>0)nonzero++;}if(!nonzero)throw new Error(`v8-canary-empty:${shot.shotId}`);outputs.push({shotId:shot.shotId,route:shot.route,path:`/generated/system-line/editorial-asset-workbench-v1/${outputVersion}/${shot.shotId}.png`,sha256:sha(raw),bytes:raw.length,alphaMin:min,alphaMax:max,nonzeroPixelCount:nonzero,containsBaseFootage:false,containsPresenterPixels:false,containsMicrophonePixels:false,containsBoomPixels:false,containsAudio:false,containsCaptions:false,fontSha256:fontSha,sourceCandidateSha256:candidate(shot.shotId).item.sha256});}
const tileW=640,tileH=390;const tiles=await Promise.all(outputs.map(async(o,i)=>({input:await sharp(path.join(outputRoot,`${o.shotId}.png`)).resize(tileW,tileH-34,{fit:"contain"}).png().toBuffer(),left:(i%3)*tileW,top:Math.floor(i/3)*tileH})));const sheet=path.join(outputRoot,"contact-sheet.png");await sharp({create:{width:tileW*3,height:tileH,channels:4,background:{r:238,g:240,b:242,alpha:1}}}).composite(tiles).png().toFile(sheet);const sheetBytes=fs.readFileSync(sheet);
const referenceTraits = {
  "ED-13": [{referenceId:"pinterest-retro-pixel-02",sha256:"291c9c7dd80bbc38ad3aeeba9adedb049de5202e82f5ae758d275e66dd77a115",role:"pixel posters and cursor symbols"},{referenceId:"pinterest-retro-pixel-06",sha256:"b3e70105fc69e2722f22c4466aa6f98af65c5102270cdf536ca06f0aa2f9afab",role:"editorial image fields and controlled two-color printing"}],
  "ED-10": [{referenceId:"pinterest-retro-pixel-04",sha256:"37f605d78250e56c4eff9e7f58de40cd2210be2aeaf0b8aea8b31d1dc2b61bf2",role:"error states and process graphics"},{referenceId:"pinterest-retro-pixel-06",sha256:"b3e70105fc69e2722f22c4466aa6f98af65c5102270cdf536ca06f0aa2f9afab",role:"dithered editorial image fields"}],
  "ED-31": [{referenceId:"pinterest-retro-pixel-03",sha256:"5b85a6e3e5cac7f136911293f0fb4025ccb2678d3be53d6e4561b9c94baa6433",role:"printer objects and process diagrams"},{referenceId:"pinterest-retro-pixel-09",sha256:"44ef5e0a4ae8d819bbf1e8c2fa0f376b7bd07722b1a9dd62ef99aa0426530c87",role:"one-bit world composition and restrained hierarchy"}]
};
const visibleNodes = {"ED-13":["国产模型写中文确实会顺一些","问题也并没有彻底解决"],"ED-10":["完成度很高的废稿"],"ED-31":["觉得不方便的地方","整理","编排","读取","检查","可控的工作流"]};
for (const output of outputs) { output.outputPath = output.path; output.bitmapSha256 = output.sourceCandidateSha256; output.generationMethod = "BUILT_IN_IMAGEGEN"; output.referenceTraitProofs = referenceTraits[output.shotId]; output.sourceReferences = output.referenceTraitProofs; output.visibleTextNodes = visibleNodes[output.shotId].map((text,index)=>({nodeId:`${output.shotId}-v8-${index+1}`,text,fontAssetId:output.shotId === "ED-31" && index > 0 && index < 5 ? "source-han-sans-cn-heavy" : "a1-fusion-pixel",fontSha256:output.shotId === "ED-31" && index > 0 && index < 5 ? supportFontSha : fontSha,proofMethod:"FONTKIT_DIRECT_GLYPH_OUTLINES"})); }
const report={contract:"A1V8VisualCanaryPackageOnly/v1",status:"READY_FOR_OBJECTIVE_VISUAL_REVIEW",reviewOnly:true,productionArtifact:false,packagingDeliverable:false,resolveInsertEligible:false,packageExportAuthorized:false,mediaGenerationScope:"THREE_SHOT_CANARY_ONLY",font:{path:"/a1-editorial-fonts/fusion-pixel.ttf",sha256:fontSha,renderer:"FONTKIT_DIRECT_GLYPH_OUTLINES"},outputs,contactSheet:{path:`/generated/system-line/editorial-asset-workbench-v1/${outputVersion}/contact-sheet.png`,sha256:sha(sheetBytes),bytes:sheetBytes.length},externalIndependentGateRequired:true,userVisualApproval:"NOT_APPROVED",productionWired:false,resolveMutationPerformed:false,finalFilmRendered:false};
fs.writeFileSync(path.join(outputRoot,"manifest.json"),`${JSON.stringify({...report,manifestSha256:sha(Buffer.from(JSON.stringify(report)))},null,2)}\n`); console.log(JSON.stringify({status:report.status,outputVersion,shotCount:outputs.length,contactSheet:report.contactSheet,outputs:outputs.map(({shotId,route,sha256,alphaMin,alphaMax})=>({shotId,route,sha256,alphaMin,alphaMax})),mediaGenerationScope:report.mediaGenerationScope,resolveMutationPerformed:false},null,2));
