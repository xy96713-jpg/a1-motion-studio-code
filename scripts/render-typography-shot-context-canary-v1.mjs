#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";
import {selectTypographyFamilyV1} from "../apps/studio-next/src/lib/a1-typography-family-selector-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const out=path.join(root,"work/typography-shot-context-v1");
const fontIndex=process.argv.indexOf("--font");
const fontFile=fontIndex>=0?process.argv[fontIndex+1]:null;
if(!fontFile||!fs.existsSync(fontFile))throw new Error("canary-font-file-required");
const digest=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const fileSha=(file)=>digest(fs.readFileSync(file));
const formalPaths=[".codex-artifacts/system-progress-system-line/current-phase.json",".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json","apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json","apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json"];
const before=Object.fromEntries(formalPaths.map((file)=>[file,fileSha(path.join(root,file))]));
const board=JSON.parse(fs.readFileSync(path.join(root,formalPaths[3]),"utf8"));
const binding=board.packageItems.find((item)=>item.shotId==="ED-01")?.styleLineage?.presenterBinding;
if(!binding)throw new Error("canary-current-presenter-binding-missing");
const source=path.join(root,"apps/studio-next/public",binding.publicUrl);
assert.equal(fileSha(source),binding.sha256);
const meta=await sharp(source).metadata();
assert.equal(meta.width,1920);assert.equal(meta.height,1080);
fs.mkdirSync(out,{recursive:true});
const width=1280,height=720;
const groups=["智能寫作","工作台"];
const baseInput={typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",effectDisplayGroups:groups};
const crops=[
  {id:"person-right",label:"PERSON RIGHT / LOSSLESS SOURCE CROP",rect:{left:0,top:180,width,height},
    protection:{x:.48,y:.15,width:.52,height:.85},region:{x:.035,y:.08,width:.42,height:.34}},
  {id:"person-left",label:"PERSON LEFT / LOSSLESS SOURCE CROP",rect:{left:640,top:180,width,height},
    protection:{x:0,y:.15,width:.61,height:.85},region:{x:.65,y:.60,width:.30,height:.31}},
];

async function glyphOverlay(plan){
  const ink=[];
  const paths=[];
  for(const group of plan.groups){
    const manifest=compileFontkitGlyphPathManifestV1({manifestId:`control-${group.index}`,fontFile,fontId:"context-control-tw-heavy",fontProfile:"EVA_MINCHO",exactCopy:group.text});
    const b=manifest.run.visibleBounds;
    const target={x:group.box.x*width,y:group.box.y*height,width:group.box.width*width,height:group.box.height*height};
    const scale=Math.min(target.width/(b.width*.60),target.height/b.height);
    const inkWidth=b.width*.60*scale,inkHeight=b.height*scale;
    const x=group.horizontalAlign==="RIGHT"?target.x+target.width-inkWidth:group.horizontalAlign==="CENTER"?target.x+(target.width-inkWidth)/2:target.x;
    const y=target.y+(target.height-inkHeight)/2;
    paths.push(`<g fill="#fff" transform="translate(${x} ${y+b.maxY*scale}) scale(${scale*.60} ${-scale}) translate(${-b.minX} 0)">${manifest.glyphs.map((g)=>`<path transform="translate(${g.originX} ${g.originY})" d="${g.pathData}"/>`).join("")}</g>`);
    ink.push({text:group.text,box:{x,y,width:inkWidth,height:inkHeight},fontSha256:manifest.font.sha256,postscriptName:manifest.font.postscriptName,outlineSha256:manifest.manifestSha256,inkHeightAt480:inkHeight*480/width});
  }
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths.join("")}</svg>`);
  return{png:await sharp(svg).png().toBuffer(),ink};
}

async function changedPixels(base,rendered,region){
  const a=await sharp(base).removeAlpha().raw().toBuffer();
  const b=await sharp(rendered).removeAlpha().raw().toBuffer();
  let changed=0;
  for(let y=Math.floor(region.y*height);y<Math.ceil((region.y+region.height)*height);y++){
    for(let x=Math.floor(region.x*width);x<Math.ceil((region.x+region.width)*width);x++){
      const i=(y*width+x)*3;
      if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
    }
  }
  return changed;
}

const results=[];
const sheetLayers=[];
for(const [row,crop] of crops.entries()){
  const base=await sharp(source).extract(crop.rect).png().toBuffer();
  const basePath=path.join(out,`${crop.id}-source.png`);
  fs.writeFileSync(basePath,base);
  const shotVisualContext={contract:"A1TypographyShotVisualContext/v1",carrierMode:"FOOTAGE",
    frame:{sha256:digest(base),width,height},geometryEvidence:{method:"MANUAL_PIXEL_REVIEW_CONSERVATIVE_RECTANGLE",frameSha256:digest(base),parentSourceSha256:binding.sha256,crop:crop.rect},
    protectedRegions:[{id:"person-conservative",box:crop.protection}],availableRegions:[{id:"reviewed-space",box:crop.region,visualSuitability:.8},
      {id:"unsafe-person-area",box:{x:crop.protection.x+.025,y:.22,width:crop.protection.width-.05,height:.50},visualSuitability:.9}],anchors:[]};
  const legacy=compileTypographyCompositionV1(baseInput);
  const plan=compileTypographyCompositionV1({...baseInput,shotVisualContext,requireShotVisualContext:true});
  assert.equal(plan.status,"PASS_REVIEW_ONLY",JSON.stringify(plan.layoutContext));
  assert.ok(plan.layoutContext.rejectedCandidates.some((candidate)=>candidate.regionId==="unsafe-person-area"));
  const oldType=await glyphOverlay(legacy),newType=await glyphOverlay(plan);
  const oldComposite=await sharp(base).composite([{input:oldType.png}]).png().toBuffer();
  const newComposite=await sharp(base).composite([{input:newType.png}]).png().toBuffer();
  const oldChanged=await changedPixels(base,oldComposite,crop.protection);
  const newChanged=await changedPixels(base,newComposite,crop.protection);
  assert.equal(newChanged,0,"source person rectangle must have zero changed pixels");
  for(const [name,bytes] of [["legacy",oldComposite],["context",newComposite],["glyph-control",newType.png]])fs.writeFileSync(path.join(out,`${crop.id}-${name}.png`),bytes);
  await sharp(newComposite).resize(480,270).png().toFile(path.join(out,`${crop.id}-context-480.png`));
  results.push({id:crop.id,sourcePath:basePath,sourceSha256:digest(base),parentSource:binding,crop:crop.rect,
    shotVisualContext,plan,legacyProtectedChangedPixels:oldChanged,contextProtectedChangedPixels:newChanged,
    glyphInk:newType.ink,outputSha256:digest(newComposite),renderAuthority:"LOCAL_EXACT_COPY_GEOMETRY_CONTROL",productionAdmission:false});
  for(const [col,bytes] of [base,oldComposite,newComposite].entries()){
    const thumb=await sharp(bytes).resize(560,315).png().toBuffer();
    sheetLayers.push({input:thumb,left:col*560,top:70+row*365});
  }
}
assert.notDeepEqual(results[0].plan.groups.map((g)=>g.box),results[1].plan.groups.map((g)=>g.box));
assert.ok(results.some((result)=>result.legacyProtectedChangedPixels>0),"at least one real-source control must expose the legacy protection failure");
assert.ok(results.every((result)=>result.glyphInk.every((ink)=>ink.inkHeightAt480>=18)),"hero control must stay readable at review size");
const background=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1680" height="800"><rect width="100%" height="100%" fill="#151515"/><g font-family="sans-serif" font-size="22" fill="white"><text x="18" y="31">REAL SOURCE / CONTROLLED REFRAME</text><text x="578" y="31">LEGACY FIXED LAYOUT</text><text x="1138" y="31">SOURCE-CONSTRAINED LAYOUT</text><text x="18" y="415">${crops[0].label}</text><text x="18" y="780">${crops[1].label}</text></g></svg>`);
await sharp(background).composite(sheetLayers).png().toFile(path.join(out,"comparison.png"));

const wholeSource=await sharp(source).resize(width,height).png().toBuffer();
const objectContext={contract:"A1TypographyShotVisualContext/v1",carrierMode:"FOOTAGE",frame:{sha256:digest(wholeSource),width,height},
  geometryEvidence:{method:"MANUAL_PIXEL_REVIEW_CONSERVATIVE_RECTANGLES",frameSha256:digest(wholeSource),parentSourceSha256:binding.sha256,resize:{width,height}},
  protectedRegions:[{id:"face-hair",box:{x:.465,y:.26,width:.18,height:.40}},{id:"body",box:{x:.32,y:.66,width:.42,height:.34}},{id:"microphone",box:{x:.345,y:.45,width:.13,height:.10}}],
  availableRegions:[{id:"near-microphone",box:{x:.245,y:.305,width:.19,height:.12}},{id:"far-wall",box:{x:.78,y:.68,width:.19,height:.12}}],
  anchors:[{id:"microphone",box:{x:.345,y:.45,width:.13,height:.10}}],selectedAnchorId:"microphone"};
const objectPlan=compileTypographyCompositionV1({typographyRole:"OBJECT_ATTACHED_LABEL",semanticEvent:"DETAIL",effectDisplayGroups:["麥克風"],shotVisualContext:objectContext});
assert.equal(objectPlan.status,"PASS_REVIEW_ONLY");assert.equal(objectPlan.layoutContext.selectedRegionId,"near-microphone");
const objectType=await glyphOverlay(objectPlan);
const objectComposite=await sharp(wholeSource).composite([{input:objectType.png}]).png().toBuffer();
const objectProtectedChanges=[];
for(const region of objectContext.protectedRegions)objectProtectedChanges.push(await changedPixels(wholeSource,objectComposite,region.box));
assert.ok(objectProtectedChanges.every((count)=>count===0));
fs.writeFileSync(path.join(out,"object-anchor-control.png"),objectComposite);
await sharp(objectComposite).resize(480,270).png().toFile(path.join(out,"object-anchor-control-480.png"));
const fullscreenContext={contract:"A1TypographyShotVisualContext/v1",carrierMode:"FULLSCREEN",frame:{width,height},protectedRegions:[],availableRegions:[{id:"title-field",box:{x:.08,y:.08,width:.84,height:.84}}],anchors:[]};
const fullscreenPlan=compileTypographyCompositionV1({typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",effectDisplayGroups:["先做","再改"],shotVisualContext:fullscreenContext});
assert.equal(fullscreenPlan.status,"PASS_REVIEW_ONLY");
const fullscreenType=await glyphOverlay(fullscreenPlan);
const fullscreenComposite=await sharp({create:{width,height,channels:3,background:"#080808"}}).composite([{input:fullscreenType.png}]).png().toBuffer();
fs.writeFileSync(path.join(out,"fullscreen-type-control.png"),fullscreenComposite);
await sharp(fullscreenComposite).resize(480,270).png().toFile(path.join(out,"fullscreen-type-control-480.png"));
const rolePlate=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420"><rect width="100%" height="100%" fill="#151515"/><g font-family="sans-serif" font-size="18" fill="white"><text x="15" y="27">OBJECT ANCHOR / REAL SOURCE PIXELS</text><text x="655" y="27">FULLSCREEN TYPE / REVIEW PLATE ONLY</text></g></svg>');
await sharp(rolePlate).composite([{input:await sharp(objectComposite).resize(640,360).png().toBuffer(),left:0,top:50},{input:await sharp(fullscreenComposite).resize(640,360).png().toBuffer(),left:640,top:50}]).png().toFile(path.join(out,"role-controls.png"));
const familyDecisions=[
  {caseId:"PRODUCT_IDENTITY_ON_PRESENTER",...selectTypographyFamilyV1({programMode:"PRODUCT_TUTORIAL",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",sourceText:"智能写作工作台",displayText:"智能写作工作台",displayGroups:["智能写作","工作台"],script:"Hans",locale:"zh-Hans-CN",selectedRegion:results[0].plan.groups[0].box,compositionGroups:results[0].plan.groups,familyHistory:[]})},
  {caseId:"SHORT_EVA_VERDICT_BREAK",...selectTypographyFamilyV1({programMode:"LONG_TAKE_OPINION",typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",sourceText:"先做再改",displayText:"先做再改",displayGroups:["先做","再改"],script:"Hans",locale:"zh-Hans-CN",preferredMechanisms:["EVA_COMPRESS"],familyHistory:["HEAVY_GOTHIC"]})},
  {caseId:"TRADITIONAL_QUESTION_COVERAGE",...selectTypographyFamilyV1({programMode:"EVIDENCE_ESSAY",typographyRole:"PRESENTER_MARKER",semanticEvent:"QUESTION",sourceText:"问题在哪",displayText:"問題在哪",displayGroups:["問題在哪"],script:"Hant",locale:"zh-Hant-TW",conversionPairs:[{index:0,source:"问",display:"問"},{index:2,source:"题",display:"題"}],copyChangeReason:"explicit traditional display copy",selectedRegion:{width:.3,height:.18},familyHistory:[]})},
].map(({caseId,status,selectedFamilyId,candidates,rejectedFamilies,reasonCodes,scriptWarning})=>({caseId,status,selectedFamilyId,candidates,rejectedFamilies,reasonCodes,scriptWarning}));

// Prepare real reference/adjacency bindings through the existing request compiler entry.
const exemplarPath=path.join(root,"work/typography-visual-reset/gawx-source-study/chinese-adaptation-board-v2.png");
const mechanismPath=path.join(root,"work/typography-visual-reset/gawx-source-study/athlete-0045-0053.png");
const input={contract:"A1TypographyContextReviewInput/v1",articleId:"source-context-static-canary",generationAllowed:true,maxConcurrency:2,designAudit:null,
  assignments:results.map((result)=>({shotId:result.id,programMode:"LONG_TAKE_OPINION",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",eventFamily:"HERO",exactCopy:"智能写作工作台",filmEffectProgram:{effectId:"EVA_COMPRESS",effectDisplayGroups:groups}})),bindings:{}};
for(const [index,result] of results.entries()){
  const adjacent=results[1-index];
  input.bindings[result.id]={semanticDuty:"DIAGNOSTIC_LAYOUT_ONLY",shotVisualContext:result.shotVisualContext,
    textSpec:{sourceText:"智能写作工作台",displayText:"智能寫作工作台",displayGroups:groups,script:"Hant",locale:"zh-Hant-TW",copyChangeReason:"user-requested traditional display study; source spelling retained"},
    holdFrame:{kind:"REAL_HOLD_FRAME",path:result.sourcePath,sha256:result.sourceSha256,use:"lossless diagnostic crop, not a new captured shot"},
    userExemplar:{kind:"USER_STYLE_EXEMPLAR",id:"current-six-frame-reference",path:exemplarPath,sha256:fileSha(exemplarPath),use:"user-provided conceptual type hierarchy only"},
    adjacentShotIds:[adjacent.id],adjacentShots:[{shotId:adjacent.id,relation:index===0?"NEXT":"PREVIOUS",typographySummary:{duty:"LAYOUT_DIAGNOSTIC",density:"TITLE",chronology:"CONTROLLED_TEST_NOT_FILM_ORDER"},frame:{kind:"REAL_ADJACENT_FRAME",path:adjacent.sourcePath,sha256:adjacent.sourceSha256,use:"adjacent static control, not original film chronology"}}],
    directions:[{id:"A",visualPrimitive:"CONDENSED_PAIR",topologyFingerprint:"condensed-pair",readingPath:"title then object",compositionAction:"unequal word-group scale"},{id:"B",visualPrimitive:"COMPACT_WORD_CLUSTER",topologyFingerprint:"compact-cluster",readingPath:"one cluster",compositionAction:"compact type-to-space relationship"}].map((direction)=>({...direction,mechanismSource:"VERIFIED_CREATOR_FRAME",exclusions:["copied face or room","invented source content"],mechanismReference:{kind:"VERIFIED_CREATOR_FRAME",path:mechanismPath,sha256:fileSha(mechanismPath),sourceUrl:"https://www.youtube.com/watch?v=55oPmIBq3Ok",creator:"Gawx",sourceWork:"Artist Athlete",mechanism:"type attached to doorway geometry, sequence 00:45-00:53",use:"previously reviewed original sequence; reference only"}}))};
}
fs.writeFileSync(path.join(out,"request-input.json"),JSON.stringify(input,null,2));
const after=Object.fromEntries(formalPaths.map((file)=>[file,fileSha(path.join(root,file))]));
assert.deepEqual(after,before,"formal artifacts must remain unchanged");
const report={contract:"A1TypographyShotContextCanary/v1",status:"STATIC_GEOMETRY_PASS_VISUAL_REVIEW_REQUIRED",results,
  additionalRoles:{object:{plan:objectPlan,protectedChangedPixels:objectProtectedChanges,outputSha256:digest(objectComposite)},fullscreen:{plan:fullscreenPlan,outputSha256:digest(fullscreenComposite)}},
  familyDecisions,
  sourceInspection:"Agent viewed registered clean source before declaring conservative geometry",scope:"CONTROLLED_REFRAMINGS_OF_ONE_REAL_SOURCE_NOT_TWO_NEW_CAPTURED_SHOTS",
  formalArtifactsUnchanged:true,formalBefore:before,formalAfter:after,generatedTypeface:false,temporalSafetyVerified:false,productionAdmission:false};
fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,outputDir:out,formalArtifactsUnchanged:true,results:results.map((r)=>({id:r.id,legacyChanged:r.legacyProtectedChangedPixels,contextChanged:r.contextProtectedChangedPixels,minimumInkHeightAt480:Math.min(...r.glyphInk.map((g)=>g.inkHeightAt480))}))},null,2));
