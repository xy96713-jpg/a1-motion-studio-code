#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {compileReferenceBoundTypographyRequestsV1} from "../apps/studio-next/src/lib/a1-reference-bound-typography-requests-v1.mjs";
import {auditTypographyReferencePlanV1,auditTypographyContextReferencePlanV1} from "../apps/studio-next/src/lib/a1-typography-reference-plan-audit-v1.mjs";
import {buildFilmTypographyProfile,validateFilmTypographyProfile} from "../apps/studio-next/src/lib/a1-film-typography-director-v1.mjs";
import {assertTypographyDesignCardActive} from "../apps/studio-next/src/lib/a1-typography-design-board-server-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
// General review input uses the same compiler as the original fixture lane.
// The current production freeze always overrides caller-supplied flags.
const inputIndex=process.argv.indexOf("--input");
if(inputIndex!==-1){
  const inputFile=process.argv[inputIndex+1];
  const outIndex=process.argv.indexOf("--out");
  const outArgument=outIndex<0?null:process.argv[outIndex+1];
  if(!inputFile||!outArgument)throw new Error("typography-review-input-and-output-required");
  const out=path.resolve(root,outArgument);
  const allowedRoot=path.join(root,"work");
  if(!out.startsWith(`${allowedRoot}${path.sep}`))throw new Error("typography-review-output-must-be-in-work");
  let ancestor=out;
  while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  if(!fs.realpathSync(ancestor).startsWith(`${fs.realpathSync(allowedRoot)}${path.sep}`)&&fs.realpathSync(ancestor)!==fs.realpathSync(allowedRoot))
    throw new Error("typography-review-output-symlink-outside-work");
  const input=JSON.parse(fs.readFileSync(path.resolve(root,inputFile),"utf8"));
  if(input.contract!=="A1TypographyContextReviewInput/v1")throw new Error("typography-review-input-contract-invalid");
  const phase=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"),"utf8"));
  const gate=phase.authority?.packagingAutomation?.generationFreeze;
  if(typeof gate?.imageGenerationAllowed!=="boolean"||typeof gate?.automaticDispatchAllowed!=="boolean")throw new Error("typography-current-generation-gate-unavailable");
  const designAudit=auditTypographyContextReferencePlanV1(input);
  const pack=compileReferenceBoundTypographyRequestsV1({...input,designAudit,generationAllowed:gate.imageGenerationAllowed&&gate.automaticDispatchAllowed,maxConcurrency:2});
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,"request-pack.json"),`${JSON.stringify(pack,null,2)}\n`);
  fs.writeFileSync(path.join(out,"design-audit.json"),`${JSON.stringify(designAudit,null,2)}\n`);
  const report={contract:"A1TypographyContextReviewBuild/v1",status:pack.status,requestCount:pack.requestCount,
    contextBoundRequests:pack.requests.filter((request)=>request.compositionPlan?.layoutContext?.status==="PASS_REVIEW_ONLY").length,
    blockers:[...new Set(pack.requests.flatMap((request)=>request.blockers))],packSha256:pack.packSha256,
    generationPerformed:false,productionAdmission:false};
  fs.writeFileSync(path.join(out,"build-report.json"),`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify({...report,outputDir:out},null,2));
  process.exit(0);
}
const fixtureDir=path.join(root,"work/typography-role-matrix-v1");
const outputDir=path.join(fixtureDir,"reference-bound-pack-v1");
const imageSha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const readJson=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const absolute=(relative)=>path.join(root,relative);
const writeIfChanged=(file,bytes)=>{
  if(fs.existsSync(file)&&Buffer.compare(fs.readFileSync(file),bytes)===0)return false;
  fs.writeFileSync(file,bytes);
  return true;
};

const sequence=readJson(path.join(fixtureDir,"sequence-plan.json"));
const directions=readJson(path.join(fixtureDir,"reference-directions-v1.json"));
const authority=readJson(path.join(fixtureDir,"typography-reference-authority-v1.json"));
if(sequence.article!==directions.articleId||sequence.shotCount!==sequence.shots.length)throw new Error("typography-sequence-identity-mismatch");
const boardFile=absolute(directions.board.path);
if(imageSha(fs.readFileSync(boardFile))!==directions.board.sha256)throw new Error("typography-user-board-sha-mismatch");
const boardMeta=await sharp(boardFile).metadata();
if(boardMeta.width!==1940||boardMeta.height!==1679||directions.board.columns!==3||directions.board.rows!==4)
  throw new Error("typography-user-board-grid-mismatch");
fs.mkdirSync(outputDir,{recursive:true});
const cellFiles=new Map();
for(const binding of Object.values(directions.bindings))for(const variant of binding.directions){
  if(cellFiles.has(variant.cell))continue;
  const gridCell=/^r([1-4])c([1-3])$/u.exec(variant.cell);
  if(!gridCell)throw new Error(`typography-board-cell-invalid:${variant.cell}`);
  assertTypographyDesignCardActive(`atlas-${String((Number(gridCell[1])-1)*3+Number(gridCell[2])).padStart(2,"0")}`);
  const rect=directions.board.tileRects[variant.cell];
  if(!rect||!/^r[1-4]c[1-3]$/u.test(variant.cell))throw new Error(`typography-board-cell-invalid:${variant.cell}`);
  const [left,top,width,height]=rect;
  if(left<0||top<0||left+width>boardMeta.width||top+height>boardMeta.height)throw new Error(`typography-board-cell-bounds:${variant.cell}`);
  const bytes=await sharp(boardFile).extract({left,top,width,height}).png().toBuffer();
  const file=path.join(outputDir,`${variant.cell}.png`);
  writeIfChanged(file,bytes);
  cellFiles.set(variant.cell,{kind:"USER_BOARD_CELL",path:file,sha256:imageSha(bytes),use:`selected ${variant.cell} typography relationship from the user's current 3x4 board`,parentBoardSha256:directions.board.sha256,gridPosition:variant.cell});
}

const generatedRoute="GENERATE_REVIEW_CANDIDATE";
const assignments=sequence.shots.map((shot)=>({
  shotId:String(shot.shot),programMode:"PRODUCT_TUTORIAL",eventFamily:shot.event,
  typographyRole:shot.route===generatedRoute?(shot.event==="DIDONE_TITLE_GRID"&&shot.shot==="11"?"CONCLUSION_STAMP":"FULLSCREEN_HERO"):shot.event==="SOURCE_NATIVE"?"SOURCE_NATIVE":shot.event==="NO_TYPE"?"NO_TYPE":"CAPTION",
  semanticEvent:shot.shot==="11"?"CONCLUSION":shot.event==="CROP_WORDMARK"?"STRONG_CONTRAST":shot.event==="DIDONE_TITLE_GRID"?"CHAPTER_BREAK":"FEATURE",
  exactCopy:shot.copy,
  filmEffectProgram:shot.route===generatedRoute?{effectId:shot.event,effectDisplayGroups:[shot.copy]}:{effectId:"NONE"},
}));
const directorProfile=buildFilmTypographyProfile(assignments,{articleId:sequence.article,programMode:"PRODUCT_TUTORIAL",maxHeroEventsPerWindow:sequence.profile.maxHeroEventsPerWindow,maxSameFamilyRun:sequence.profile.maxSameEventRun});
const directorFailures=validateFilmTypographyProfile(directorProfile);
if(directorFailures.length)throw new Error(`typography-film-director-invalid:${directorFailures.join(",")}`);
const designAudit=auditTypographyReferencePlanV1({authority,sequence,directions,directorProfile,repoRoot:root});
const bindings={};
for(const [shotId,binding] of Object.entries(directions.bindings)){
  if(!sequence.shots.some((shot)=>shot.shot===shotId&&shot.route===generatedRoute))throw new Error(`typography-binding-out-of-route:${shotId}`);
  const exemplar=authority.userReferences.find((reference)=>reference.id===binding.userExemplarId);
  if(binding.userExemplarId&&!exemplar)throw new Error(`typography-user-exemplar-unknown:${binding.userExemplarId}`);
  const userExemplar=exemplar?{kind:"USER_STYLE_EXEMPLAR",id:exemplar.id,path:absolute(exemplar.path),sha256:exemplar.sha256,use:exemplar.use}:null;
  bindings[shotId]={...binding,directions:binding.directions.map((direction)=>{
    const pin=directions.pinterestReferences[direction.pinterest];
    if(!pin)throw new Error(`typography-pinterest-reference-missing:${direction.pinterest}`);
    const pinFile=absolute(pin.path);
    const pinBytes=fs.readFileSync(pinFile);
    return {...direction,mechanismSource:directions.comparisonLanes?.[direction.id],boardCell:cellFiles.get(direction.cell),pinterest:{kind:"PINTEREST_MECHANISM",path:pinFile,sha256:imageSha(pinBytes),sourceUrl:pin.sourceUrl,mechanism:pin.mechanism,use:"study transferable topology and reading rhythm only"}};
  }),userExemplar};
}
const phase=readJson(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"));
const freeze=phase.authority?.packagingAutomation?.generationFreeze;
if(typeof freeze?.imageGenerationAllowed!=="boolean"||typeof freeze?.automaticDispatchAllowed!=="boolean")
  throw new Error("typography-current-generation-gate-unavailable");
const generationAllowed=freeze.imageGenerationAllowed===true&&freeze.automaticDispatchAllowed===true;
const pack=compileReferenceBoundTypographyRequestsV1({articleId:sequence.article,assignments,bindings,designAudit,generationAllowed,maxConcurrency:2});
const report={contract:"A1TypographyReferenceBoundBuildReport/v1",status:pack.status,articleId:sequence.article,requestCount:pack.requestCount,plannedPrimitiveLabelCount:new Set(pack.requests.map((item)=>item.visualPrimitive)).size,actualGeneratedVisualDifferencesProven:0,uniqueBoardCells:cellFiles.size,userExemplarImageAttachments:new Set(pack.requests.flatMap((item)=>item.references.filter((reference)=>reference.kind==="USER_STYLE_EXEMPLAR").map((reference)=>reference.sha256))).size,pinterestImageAttachments:new Set(pack.requests.flatMap((item)=>item.references.filter((reference)=>reference.kind==="PINTEREST_MECHANISM").map((reference)=>reference.sha256))).size,designAuditStatus:designAudit.status,designAuditSha256:designAudit.auditSha256,directorProfileSha256:directorProfile.profileSha256,directorMismatches:designAudit.directorMismatches,blockedRequests:pack.requests.filter((item)=>item.blockers.length).length,blockers:[...new Set(pack.requests.flatMap((item)=>item.blockers))],baseCompilation:pack.baseCompilation,packSha256:pack.packSha256,productionAdmission:false};
writeIfChanged(path.join(outputDir,"request-pack.json"),Buffer.from(`${JSON.stringify(pack,null,2)}\n`));
writeIfChanged(path.join(outputDir,"build-report.json"),Buffer.from(`${JSON.stringify(report,null,2)}\n`));
writeIfChanged(path.join(outputDir,"design-audit.json"),Buffer.from(`${JSON.stringify(designAudit,null,2)}\n`));

const sheetWidth=1180,cardWidth=570,cardHeight=246;
const boardThumbWidth=350,boardThumbHeight=205,pinThumbWidth=155,pinThumbHeight=205;
const composites=[];
for(let index=0;index<pack.requests.length;index++){
  const request=pack.requests[index];
  const x=20+(index%2)*590,y=58+Math.floor(index/2)*cardHeight;
  const exemplar=request.references.find((reference)=>reference.kind==="USER_STYLE_EXEMPLAR");
  const mechanism=request.references.find((reference)=>["USER_BOARD_CELL","PINTEREST_MECHANISM"].includes(reference.kind));
  const exemplarThumb=exemplar?await sharp(exemplar.path).resize(boardThumbWidth,boardThumbHeight,{fit:"contain",background:"#202020"}).png().toBuffer():Buffer.from(`<svg width="${boardThumbWidth}" height="${boardThumbHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#292025"/><text x="18" y="104" fill="#f79b92" font-family="Arial" font-size="18">USER ANCHOR MISSING</text></svg>`);
  const mechanismThumb=await sharp(mechanism.path).resize(pinThumbWidth,pinThumbHeight,{fit:"contain",background:"#202020"}).png().toBuffer();
  composites.push({input:exemplarThumb,left:x+8,top:y+27},{input:mechanismThumb,left:x+boardThumbWidth+19,top:y+27});
}
const labels=pack.requests.map((request,index)=>{
  const x=28+(index%2)*590,y=58+Math.floor(index/2)*cardHeight;
  return `<text x="${x}" y="${y+20}" fill="#eee9dc" font-family="Arial" font-size="18">${request.shotId} / ${request.variantId} · ${request.visualPrimitive}</text>`;
}).join("");
const plate=Buffer.from(`<svg width="${sheetWidth}" height="${58+Math.ceil(pack.requests.length/2)*cardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="28" y="32" fill="#eee9dc" font-family="Arial" font-size="20">USER EXEMPLAR + ONE MECHANISM · DESIGN AUDIT REQUIRED</text>${labels}</svg>`);
const contact=await sharp(plate).composite(composites).png().toBuffer();
writeIfChanged(path.join(outputDir,"reference-contact-sheet.png"),contact);
console.log(JSON.stringify({...report,outputDir},null,2));
