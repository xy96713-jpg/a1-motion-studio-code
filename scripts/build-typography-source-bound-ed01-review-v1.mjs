#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {compileTypographyArticleDecisionPlanV1} from "../apps/studio-next/src/lib/a1-typography-article-decision-plan-v1.mjs";
import {typographyShotContextFromVideoPackagingV1,typographyBoxesIntersectV1} from "../apps/studio-next/src/lib/a1-typography-shot-context-v1.mjs";
import {assertTypographyDesignCardActive} from "../apps/studio-next/src/lib/a1-typography-design-board-server-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
assertTypographyDesignCardActive("gawx-01");
const publicRoot=path.join(root,"apps/studio-next/public");
const generatedRoot=path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1");
const outputDir=path.join(root,"work/typography-intelligent-packaging-v1/ed01-source-bound");
const workspacePath=path.join(generatedRoot,"workspace.json");
const manifestPath=path.join(generatedRoot,"whole-film-static-board-v1/board-manifest.json");
const wholeFilmPlanPath=path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json");
const referenceRoot=path.join(root,"work/typography-visual-reset/gawx-source-study");
const boardFile=path.join(referenceRoot,"chinese-adaptation-board-v2.png");
const baseRef={creator:"Gawx",sourceUrl:"https://www.youtube.com/watch?v=Z67RYr19I_Q",sourceWork:"I Made an Animation in 24 Different Styles (2021)",mechanism:"Red word COLORING progressively reveals in relation to a vertical foreground object, 01:00–01:08."};
const axisRef={creator:"Gawx",sourceUrl:"https://www.youtube.com/watch?v=55oPmIBq3Ok",sourceWork:"Artist Athlete (2026)",mechanism:"Type follows a real doorway axis as the camera moves from an eye close-up into a deep entrance, 00:45–00:53."};
const sha=(value)=>crypto.createHash("sha256").update(value).digest("hex");
const localFromPublic=(url)=>path.join(publicRoot,String(url).replace(/^\//u,""));
const readJson=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const escapeXml=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

const workspace=readJson(workspacePath);
const board=readJson(manifestPath);
const filmPlan=readJson(wholeFilmPlanPath);
const contextRecord=workspace.production.shotIntelligence.videoPackagingContexts.items.find((item)=>item.shotId==="ED-01");
const adjacentIds=["ED-02","ED-03"];
const adjacent=adjacentIds.map((shotId)=>board.timelineItems.find((item)=>item.shotId===shotId));
const selected=board.packageItems.find((item)=>item.shotId==="ED-01");
const sourceAssignment=filmPlan.assignments.find((item)=>item.shotId==="ED-01");
assert.ok(contextRecord?.baseFrame?.publicUrl&&selected?.styleLineage?.presenterBinding,"ED-01 verified source context and incumbent are required");
assert.ok(adjacent.every((item)=>item?.preview?.publicUrl&&item.preview.sha256),"both actual neighboring shot previews are required");
assert.ok(sourceAssignment?.typographyRole==="PRESENTER_HERO"&&sourceAssignment.generatedTypographyPlan?.exactCopyShadow,"current ED-01 typography decision is required");

fs.mkdirSync(path.join(outputDir,"references"),{recursive:true});
const parentBoardSha=sha(fs.readFileSync(boardFile));
const boardMeta=await sharp(boardFile).metadata();
assert.equal(boardMeta.width,1302);assert.equal(boardMeta.height,1208);
const cellRects={stageWord:{left:8,top:86,width:638,height:338},faceTakeover:{left:658,top:86,width:638,height:338}};
const cellFiles={};
for(const [id,rect] of Object.entries(cellRects)){
  const file=path.join(outputDir,"references",`gawx-cell-${id}.png`);
  await sharp(boardFile).extract(rect).png().toFile(file);
  cellFiles[id]={file,sha256:sha(fs.readFileSync(file)),kind:"USER_STYLE_EXEMPLAR",parentBoardSha256:parentBoardSha,crop:rect};
}

const sourceFrame=localFromPublic(contextRecord.baseFrame.publicUrl);
assert.equal(sha(fs.readFileSync(sourceFrame)),contextRecord.baseFrame.sha256,"ED-01 hold frame must match current source context");
const sourceMeta=await sharp(sourceFrame).metadata();
assert.deepEqual([sourceMeta.width,sourceMeta.height],[1920,1080]);
const previousArtifact=localFromPublic(selected.styleLineage.presenterBinding.publicUrl);
assert.equal(sha(fs.readFileSync(previousArtifact)),selected.styleLineage.presenterBinding.sha256,"incumbent ED-01 output must match current board");

const adjacentBindings=await Promise.all(adjacent.map(async(item)=>{
  const file=localFromPublic(item.preview.publicUrl);
  const bytes=fs.readFileSync(file);
  assert.equal(sha(bytes),item.preview.sha256,`${item.shotId} adjacent preview SHA`);
  const metadata=await sharp(bytes).metadata();
  assert.ok(metadata.width>0&&metadata.height>0,`${item.shotId} preview must decode`);
  const contextShot=filmPlan.assignments.find((entry)=>entry.shotId===item.shotId);
  return{shotId:item.shotId,relation:"NEXT",typographySummary:{duty:contextShot?.typographyRole||"SOURCE_NATIVE",density:"SOURCE_OWNED",chronology:"IMMEDIATE_ARTICLE_SUCCESSOR"},frame:{kind:"REAL_ADJACENT_FRAME",path:file,sha256:item.preview.sha256,use:`verified current ${item.preview.provenance} preview for the next article beat`},sourceText:item.sourceText||""};
}));

const shotVisualContext=typographyShotContextFromVideoPackagingV1(contextRecord);
assert.ok(shotVisualContext&&shotVisualContext.frame.sha256===contextRecord.baseFrame.sha256,"video packaging context must resolve from verified ED-01 hold frame");
const sourceComposition=compileTypographyCompositionV1({typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",effectDisplayGroups:["vibe coding","智能写作工作台"],shotVisualContext,requireShotVisualContext:true});
assert.equal(sourceComposition.status,"PASS_REVIEW_ONLY","source-aware composition must find a safe, readable region");
const familyAssignments=[
  {shotId:"ED-01",programMode:"PRODUCT_TUTORIAL",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",carrier:"PRESENTER_DEPTH_HERO",masterFamily:"PRESENTER_IDENTITY_HERO",exactCopy:"智能写作工作台",displayCopy:"智能写作工作台",displayGroups:["智能写作","工作台"],motionPlan:sourceAssignment.motionPlan},
  ...adjacent.map((item)=>{const next=filmPlan.assignments.find((entry)=>entry.shotId===item.shotId);return{
    shotId:item.shotId,programMode:next?.programMode||"PRODUCT_TUTORIAL",typographyRole:next?.typographyRole||"SOURCE_NATIVE",semanticEvent:next?.semanticEvent||"ORDINARY",
    carrier:next?.carrier||"REAL_SOURCE_SURFACE",masterFamily:next?.masterFamily||null,exactCopy:next?.exactCopy||item.sourceText||"",displayCopy:next?.displayCopy||item.sourceText||"",
    displayGroups:[next?.exactCopy||item.sourceText||""],motionPlan:next?.motionPlan||null,
  };}),
];
const decisionPlan=compileTypographyArticleDecisionPlanV1({articleId:"current-product-workbench",genre:"product-tutorial",programMode:"PRODUCT_TUTORIAL",assignments:familyAssignments,shotVisualContexts:{"ED-01":shotVisualContext}});
const ed01Decision=decisionPlan.decisions[0];
assert.equal(ed01Decision.familyDecision.sourceContextProvided,true);
assert.equal(ed01Decision.composition.status,"PASS_REVIEW_ONLY");
assert.equal(ed01Decision.userStyle.selectedReferenceCell,"01","ED-01 presenter identity should bind to the user-selected stage-word mechanism");
assert.ok(ed01Decision.familyDecision.candidates.find((candidate)=>candidate.familyId==="HEAVY_GOTHIC")?.reasons.includes("USER_FAMILY_PREFERENCE_MATCH"),"the Gawx stage-word reference should inform the family ranking");

const faceCoverBox={x:.06,y:.24,width:.88,height:.30};
const faceOverlap=shotVisualContext.protectedRegions.some((region)=>typographyBoxesIntersectV1(faceCoverBox,region.box,shotVisualContext.safetyPadding));
assert.equal(faceOverlap,true,"oversized face-cover treatment must be rejected by protected-region geometry");

const exemplar={kind:"USER_STYLE_EXEMPLAR",id:"gawx-cell-01-stage-word",path:cellFiles.stageWord.file,sha256:cellFiles.stageWord.sha256,
  use:"user-selected stage-word treatment; transfer hierarchy only, not the sample words, person, room, or composition"};
const originalRef=(file,sha256Value,meta,use)=>({kind:"VERIFIED_CREATOR_FRAME",path:file,sha256:sha256Value,sourceUrl:meta.sourceUrl,creator:meta.creator,sourceWork:meta.sourceWork,mechanism:meta.mechanism,use});
const animationFile=path.join(referenceRoot,"animation-0060-0068.png");
const spatialFile=path.join(referenceRoot,"athlete-0045-0053.png");
const directions=[
  {id:"A-STAGE-HIERARCHY",visualPrimitive:"RED_STAGE_WORD_WITH_SUPPORT",topologyFingerprint:"two-scale-stage-word-and-support",readingPath:"product phrase, then product category",compositionAction:"Use the user-selected stage-word hierarchy inside the verified upper-left negative space; preserve the presenter and keep the red role to one semantic group.",mechanismSource:"VERIFIED_CREATOR_FRAME",mechanismReference:originalRef(animationFile,sha(fs.readFileSync(animationFile)),baseRef,"study the red word's relation to a vertical source object; do not copy the source wording or art"),exclusions:["copied creator identity","copied source wording","face or body overlap","authored background"]},
  {id:"B-SPATIAL-LOCKUP",visualPrimitive:"AXIS-RESPONSIVE-PRESENTER-LOCKUP",topologyFingerprint:"asymmetric-lockup-keyed-to-source-edge",readingPath:"small mode phrase, then dominant product name",compositionAction:"Use the same verified negative-space region but key the group alignment and scale to one frame edge; preserve all protected person and microphone pixels.",mechanismSource:"VERIFIED_CREATOR_FRAME",mechanismReference:originalRef(spatialFile,sha(fs.readFileSync(spatialFile)),axisRef,"study type aligned to photographed space and its approach axis; do not copy the doorway or source composition"),exclusions:["copied creator identity","copied source wording","invented doorway","face or microphone overlap"]},
];
const requestInput={contract:"A1TypographyContextReviewInput/v1",articleId:"ed01-gawx-source-bound-review",generationAllowed:true,maxConcurrency:2,designAudit:null,
  assignments:[{shotId:"ED-01",programMode:"PRODUCT_TUTORIAL",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",eventFamily:"HERO",exactCopy:"智能写作工作台",filmEffectProgram:{effectId:"CLEAN_EDITORIAL",effectDisplayGroups:["智能写作","工作台"]}}],
  bindings:{"ED-01":{semanticDuty:"PRESENTER_IDENTITY_ESTABLISHES_PRODUCT_SOURCE",shotVisualContext,textSpec:{sourceText:"智能写作工作台",displayText:"智能写作工作台",displayGroups:["智能写作","工作台"],script:"Hans",locale:"zh-Hans-CN",conversionPairs:[],copyChangeReason:null},
    holdFrame:{kind:"REAL_HOLD_FRAME",path:sourceFrame,sha256:contextRecord.baseFrame.sha256,use:"current verified ED-01 presenter hold frame"},userExemplar:exemplar,
    adjacentShotIds:adjacentIds,adjacentShots:adjacentBindings.map(({sourceText,...item})=>item),directions,recentFontFamilies:[]}},
};
const report={contract:"A1TypographySourceBoundED01Review/v1",status:"SOURCE_AND_SEQUENCE_BOUND_REVIEW_ONLY",shotId:"ED-01",currentSourceSentence:sourceAssignment.exactCopyShadow,
  exactReviewCopy:"智能写作工作台",selectedFamily:ed01Decision.familyDecision.selectedFamilyId,selectedFontSha256:ed01Decision.familyDecision.selectedFontSha256,
  composition:{status:sourceComposition.status,recipeId:sourceComposition.recipeId,selectedRegionId:sourceComposition.layoutContext.selectedRegionId,
    groups:sourceComposition.groups.map(({text,box,horizontalAlign})=>({text,box,horizontalAlign})),layoutEvidence:ed01Decision.familyDecision.layoutEvidence,failures:sourceComposition.failures},
  holdFrame:{path:sourceFrame,sha256:contextRecord.baseFrame.sha256,provenance:contextRecord.baseFrame.provenance},
  adjacentFrames:adjacentBindings.map(({sourceText,...item})=>({shotId:item.shotId,relation:item.relation,sha256:item.frame.sha256,provenance:board.timelineItems.find((entry)=>entry.shotId===item.shotId)?.preview?.provenance})),
  styleReference:{boardPath:path.relative(root,boardFile),boardSha256:parentBoardSha,selectedCell:"01 · 阶段重字",cellPath:cellFiles.stageWord.file,cellSha256:cellFiles.stageWord.sha256},
  negativeControl:{treatment:"UNMASKED_GIANT_TITLE_BOX_CROSSING_FACE",proposedBox:faceCoverBox,overlapsProtectedPresenter:true,
    decision:"REJECT_THIS_UNMASKED_COMPOSITION_ONLY",rejectionReason:"PRESENTER_PROTECTED_REGION_OVERLAP",
    doesNotReject:["large presenter hero in verified negative space","large presenter hero behind a registered foreground matte","glyph-local gradient, splice, or counterform reveal"],
    matteOrEffectVisualProof:"NOT_YET_RUN"},
  presenterHeroRoute:{role:"PRESENTER_HERO",supportedTypeIntents:["HERO","MASKED_HERO"],
    registeredMatteRequiredForFaceCrossing:"yes",effectChoicesFromTypographyContract:["LOCAL_GRADIENT","SPLICE_REASSEMBLE","COUNTERFORM_REVEAL"],
    currentVariantStatus:"ROUTE_SUPPORTED_VISUAL_VARIANTS_NOT_GENERATED",actualMaskedHeroReview:"NOT_RUN"},
  directions:directions.map(({id,visualPrimitive,topologyFingerprint,mechanismSource,mechanismReference})=>({id,visualPrimitive,topologyFingerprint,mechanismSource,mechanism:mechanismReference.mechanism})),
  constraints:{adjacencyIsChronological:true,adjacentFramesAreCurrentStaticBoardPreviews:true,geometryIsDeclaredFromVerifiedSourceContext:true,familyDecisionIsProposalOnly:true,imageGenerationPerformed:false,productionAdmission:false},
  formalArtifactsBefore:{workspaceSha256:sha(fs.readFileSync(workspacePath)),boardManifestSha256:sha(fs.readFileSync(manifestPath))},
  decisionPlanSha256:decisionPlan.planSha256};

const W=1280,H=1080,panelW=640,panelH=340,headH=34;
const tiles=[];
async function panel(file,left,top,label,fit="cover"){
  const bytes=await sharp(file).resize(panelW,panelH,{fit,background:"#111619"}).png().toBuffer();
  const labelSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${headH}"><rect width="100%" height="100%" fill="#080b0b"/><text x="16" y="23" fill="#eee9dc" font-family="Arial" font-size="15">${escapeXml(label)}</text></svg>`);
  tiles.push({input:labelSvg,left,top},{input:bytes,left,top:top+headH});
}
await panel(sourceFrame,0,0,"CURRENT ED-01 HOLD FRAME · selected type region outlined below");
const annotatedSource=await sharp(sourceFrame).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="76.8" y="54" width="537.6" height="345.6" fill="none" stroke="#c8ff36" stroke-width="5"/><text x="85" y="90" fill="#c8ff36" font-family="Arial" font-size="34">REVIEW REGION</text></svg>`)}]).png().toBuffer();
tiles[1].input=await sharp(annotatedSource).resize(panelW,panelH,{fit:"cover"}).png().toBuffer();
await panel(cellFiles.stageWord.file,panelW,0,"USER STYLE REFERENCE · CELL 01 STAGE WORD","contain");
await panel(animationFile,0,panelH+headH,"GAWX ORIGINAL MECHANISM A · RED TYPE / SOURCE OBJECT");
await panel(spatialFile,panelW,panelH+headH,"GAWX ORIGINAL MECHANISM B · TYPE / SPATIAL AXIS");
await panel(adjacentBindings[0].frame.path,0,2*(panelH+headH),"NEXT SHOT ED-02 · REAL SOURCE RESULT PREVIEW");
await panel(adjacentBindings[1].frame.path,panelW,2*(panelH+headH),"NEXT SHOT ED-03 · REAL SOURCE RESULT PREVIEW");
const footer=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="280"><rect width="100%" height="100%" fill="#111619"/><g font-family="Arial,sans-serif"><text x="20" y="35" fill="#c8ff36" font-size="19">SOURCE-BOUND REVIEW · NO GENERATION</text><text x="20" y="72" fill="#eee9dc" font-size="16">Copy: ${escapeXml(report.exactReviewCopy)} · Proposed family: ${escapeXml(report.selectedFamily||"none")}</text><text x="20" y="108" fill="#9ca9a5" font-size="14">Safe region: ${escapeXml(sourceComposition.layoutContext.selectedRegionId)} · Variants: stage-word / axis-lockup</text><text x="20" y="146" fill="#ffb94f" font-size="14">Only the unmasked face-crossing box is rejected; large hero and glyph effects remain in the route.</text><text x="20" y="186" fill="#9ca9a5" font-size="13">A face-crossing hero requires a registered matte and exact-pixel review; ED-01 matte variant is not yet reviewed.</text><text x="20" y="222" fill="#71807a" font-size="12">Current ImageGen gate is frozen. This sheet is the source-bound plan, not generated typography.</text></g></svg>`;
tiles.push({input:Buffer.from(footer),left:0,top:3*(panelH+headH)});
const sheet=await sharp({create:{width:W,height:3*(panelH+headH)+280,channels:4,background:"#080b0b"}}).composite(tiles).png().toBuffer();

fs.mkdirSync(path.join(outputDir,"references"),{recursive:true});
fs.writeFileSync(path.join(outputDir,"request-input.json"),`${JSON.stringify(requestInput,null,2)}\n`);
fs.writeFileSync(path.join(outputDir,"decision-plan.json"),`${JSON.stringify(decisionPlan,null,2)}\n`);
fs.writeFileSync(path.join(outputDir,"source-binding-report.json"),`${JSON.stringify(report,null,2)}\n`);
fs.writeFileSync(path.join(outputDir,"source-bound-review.png"),sheet);
const unchanged={workspace:sha(fs.readFileSync(workspacePath))===report.formalArtifactsBefore.workspaceSha256,board:sha(fs.readFileSync(manifestPath))===report.formalArtifactsBefore.boardManifestSha256};
assert.ok(unchanged.workspace&&unchanged.board,"formal workspace and board must remain unchanged");
const buildReport={contract:"A1TypographySourceBoundED01Build/v1",status:"PASS_REVIEW_ONLY",outputDir:path.relative(root,outputDir),
  referenceCells:Object.fromEntries(Object.entries(cellFiles).map(([id,item])=>[id,{sha256:item.sha256,crop:item.crop}])),
  holdFrameSha256:contextRecord.baseFrame.sha256,adjacentFrameCount:adjacentBindings.length,decisionPlanStatus:decisionPlan.status,
  selectedFamily:ed01Decision.familyDecision.selectedFamilyId,compositionStatus:ed01Decision.composition.status,
  negativeControlRejected:faceOverlap,formalArtifactsUnchanged:unchanged,imageGenerationPerformed:false,productionAdmission:false};
fs.writeFileSync(path.join(outputDir,"build-report.json"),`${JSON.stringify(buildReport,null,2)}\n`);
console.log(JSON.stringify(buildReport,null,2));
