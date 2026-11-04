#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";
import {selectTypographyFamilyV1} from "../apps/studio-next/src/lib/a1-typography-family-selector-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const work=path.join(root,"work/typography-shot-context-v1");
const out=path.join(work,"family-selection-v1");
const sourceReport=JSON.parse(fs.readFileSync(path.join(work,"report.json"),"utf8"));
const W=1280,H=720;
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const load=(file)=>fs.readFileSync(path.join(work,file));
fs.mkdirSync(out,{recursive:true});

const identity={id:"identity",label:"身份 / 产品教程",source:load("person-right-source.png"),context:sourceReport.results.find((item)=>item.id==="person-right").shotVisualContext,
  selector:{programMode:"PRODUCT_TUTORIAL",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",sourceText:"智能写作工作台",displayText:"智能写作工作台",displayGroups:["智能写作","工作台"],script:"Hans",locale:"zh-Hans-CN"},
  planInput:{typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",effectDisplayGroups:["智能写作","工作台"]}};
const verdict={id:"verdict",label:"短判决 / 观点",source:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#101114"/></svg>`),context:{contract:"A1TypographyShotVisualContext/v1",carrierMode:"FULLSCREEN",frame:{width:W,height:H},protectedRegions:[],availableRegions:[{id:"title-field",box:{x:.08,y:.08,width:.84,height:.84}}],anchors:[]},
  selector:{programMode:"LONG_TAKE_OPINION",typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",sourceText:"先做再改",displayText:"先做再改",displayGroups:["先做","再改"],script:"Hans",locale:"zh-Hans-CN",preferredMechanisms:["EVA_COMPRESS"]},
  planInput:{typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",effectDisplayGroups:["先做","再改"]}};
const question={id:"question",label:"提问 / 繁体字面",source:load("person-left-source.png"),context:sourceReport.results.find((item)=>item.id==="person-left").shotVisualContext,
  selector:{programMode:"EVIDENCE_ESSAY",typographyRole:"FULLSCREEN_HERO",semanticEvent:"QUESTION",sourceText:"问题在哪",displayText:"問題在哪",displayGroups:["問題在哪"],script:"Hant",locale:"zh-Hant-TW",conversionPairs:[{index:0,source:"问",display:"問"},{index:1,source:"题",display:"題"}],copyChangeReason:"explicit traditional Chinese display copy"},
  planInput:{typographyRole:"FULLSCREEN_HERO",semanticEvent:"QUESTION",effectDisplayGroups:["問題在哪"]}};

async function renderText(plan,candidate){
  const all=[];
  for(const group of plan.groups){
    const manifest=compileFontkitGlyphPathManifestV1({manifestId:`${candidate.familyId}-${group.index}`,fontFile:candidate.fontPath,fontId:candidate.fontId,fontProfile:candidate.shape,exactCopy:group.text});
    const b=manifest.run.visibleBounds;
    const target={x:group.box.x*W,y:group.box.y*H,width:group.box.width*W,height:group.box.height*H};
    const sx=candidate.scaleX||1,sy=candidate.scaleY||1;
    const scale=Math.min(target.width/(b.width*sx),target.height/b.height);
    const inkWidth=b.width*sx*scale,inkHeight=b.height*scale;
    const x=group.horizontalAlign==="RIGHT"?target.x+target.width-inkWidth:group.horizontalAlign==="CENTER"?target.x+(target.width-inkWidth)/2:target.x;
    const y=target.y+(target.height-inkHeight)/2;
    all.push(`<g fill="#fff" transform="translate(${x} ${y+b.maxY*scale}) scale(${scale*sx} ${-scale*sy}) translate(${-b.minX} 0)">${manifest.glyphs.map((g)=>`<path transform="translate(${g.originX} ${g.originY})" d="${g.pathData}"/>`).join("")}</g>`);
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${all.join("")}</svg>`)).png().toBuffer();
}

const panels=[];
const decisions=[];
for(const item of [identity,verdict,question]){
  const rowIndex=decisions.length;
  const selection=selectTypographyFamilyV1({...item.selector,selectedRegion:item.context.availableRegions[0].box,frameWidth:W,frameHeight:H,familyHistory:[]});
  assert.equal(selection.status,"READY_FOR_VISUAL_COMPARISON",`${item.id}:${selection.reasonCodes}`);
  const plan=compileTypographyCompositionV1({...item.planInput,shotVisualContext:item.context,requireShotVisualContext:true});
  assert.equal(plan.status,"PASS_REVIEW_ONLY",`${item.id}:${plan.failures.map((failure)=>failure.code)}`);
  const candidates=selection.candidates.slice(0,2);
  for(const [index,candidate] of candidates.entries()){
    const composite=await sharp(item.source).composite([{input:await renderText(plan,candidate)}]).png().toBuffer();
    const file=`${item.id}-${index===0?"selected":"alternative"}.png`;
    fs.writeFileSync(path.join(out,file),composite);
    panels.push({input:await sharp(composite).resize(640,360).png().toBuffer(),left:index*640,top:56+rowIndex*400});
    if(index===0)decisions.push({id:item.id,label:item.label,sourceCopy:selection.sourceText,displayCopy:selection.displayText,
      selectedFamilyId:candidate.familyId,fontSha256:candidate.fontSha256,score:candidate.score,
      alternativeFamilyId:selection.candidates[1]?.familyId||null,scriptWarning:selection.scriptWarning||null,
      geometryRegion:plan.layoutContext.selectedRegionId||"title-field",renderedFile:file,
      sourceSha256:item.context.frame.sha256||null,productionAdmission:false});
  }
  if(candidates.length===1){
    decisions.at(-1).alternativeFamilyId=null;
    const unavailable=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#22252a"/><g font-family="sans-serif" font-size="24" fill="#eee9dc"><text x="40" y="150">没有第二个字族通过字形覆盖</text><text x="40" y="195">缺字候选不会被当作可用替代方案</text></g></svg>`);
    panels.push({input:await sharp(unavailable).png().toBuffer(),left:640,top:56+rowIndex*400});
  }
}

const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1256"><rect width="100%" height="100%" fill="#151619"/><g font-family="sans-serif" font-size="18" fill="#f1eee8"><text x="12" y="25">IDENTITY · ${decisions[0].selectedFamilyId} · SELECTED</text><text x="652" y="25">ALTERNATIVE · ${decisions[0].alternativeFamilyId}</text><text x="12" y="425">VERDICT · ${decisions[1].selectedFamilyId} · SELECTED</text><text x="652" y="425">ALTERNATIVE · ${decisions[1].alternativeFamilyId}</text><text x="12" y="825">QUESTION · ${decisions[2].selectedFamilyId} · SELECTED</text><text x="652" y="825">COVERAGE GATE</text></g></svg>`);
const board=await sharp(svg).composite(panels).png().toBuffer();
fs.writeFileSync(path.join(out,"comparison.png"),board);
const report={contract:"A1TypographyFamilySelectionVisualCanary/v1",status:"LOCAL_FONT_COMPARISON_REVIEW_ONLY",decisions,
  renderedCandidates:decisions.length*2,sourceFrames:["person-right-source.png","person-left-source.png"],
  proofBoundary:{actualGlyphOutlines:true,generatedTypeface:false,generatedAsset:false,automaticAestheticApproval:false,productionAdmission:false},
  generationGate:{performed:false,reason:"Current system-line imageGenerationAllowed=false; this canary uses packaged SHA-bound fonts only."},
  boardSha256:sha(board)};
fs.writeFileSync(path.join(out,"report.json"),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,outputDir:out,boardSha256:report.boardSha256,selections:decisions.map(({id,selectedFamilyId,alternativeFamilyId})=>({id,selectedFamilyId,alternativeFamilyId})),productionAdmission:false},null,2));
