#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const renderer=path.join(root,"remotion-renderer");
const workDir=path.join(root,"work/typography-word-actor-hero-canary-v1");
const publicDir=path.join(root,"apps/studio-next/public/generated/system-line/typography-director-v3");
const remotion=path.join(renderer,"node_modules/.bin/remotion");
const baseline=JSON.parse(fs.readFileSync(path.join(workDir,"baseline.json"),"utf8"));
const planSet=JSON.parse(fs.readFileSync(path.join(workDir,"word-actor-plans.json"),"utf8"));
const blind=JSON.parse(fs.readFileSync(path.join(workDir,"blind-fixture-report.json"),"utf8"));
const props=JSON.parse(fs.readFileSync(path.join(workDir,"canary-props.json"),"utf8"));
const carriers=JSON.parse(fs.readFileSync(path.join(workDir,"carrier-evidence.json"),"utf8"));
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const write=(file,value)=>fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,`utf8`);
const render=(composition,file,propsFile)=>execFileSync(remotion,["still","src/index.ts",composition,path.relative(renderer,file),"--frame=100",`--props=${propsFile}`,"--image-format=png","--log=error"],{cwd:renderer,stdio:"inherit"});

fs.mkdirSync(workDir,{recursive:true});
const holds=[];
const transparent=[];
for(let index=0;index<props.items.length;index+=1){
  const hold=path.join(workDir,`hero-${index+1}-hold.png`);
  const alpha=path.join(workDir,`hero-${index+1}-transparent.png`);
  render("A1TypographyHeroWordActorCanaryV1",hold,`src/generated/typographyHeroWordActorCanaryProps-${index}.json`);
  render("A1TypographyHeroWordActorTransparentCanaryV1",alpha,`src/generated/typographyHeroWordActorTransparentCanaryProps-${index}.json`);
  holds.push(hold);
  transparent.push(alpha);
}
const repeat=path.join(workDir,"hero-1-hold-repeat.png");
render("A1TypographyHeroWordActorCanaryV1",repeat,"src/generated/typographyHeroWordActorCanaryProps-0.json");

const contactSheet=path.join(workDir,"three-hero-word-actor-contact-sheet.png");
await sharp({create:{width:1920,height:3240,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(holds.map((input,index)=>({input,left:0,top:index*1080}))).png().toFile(contactSheet);
const comparison=path.join(workDir,"three-hero-incumbent-comparison.png");
const newThumbs=await Promise.all(holds.map((file)=>sharp(file).resize(640,360,{fit:"fill"}).png().toBuffer()));
const incumbentThumbs=await Promise.all(carriers.items.map((item)=>sharp(path.join(root,item.file)).resize(640,360,{fit:"fill"}).png().toBuffer()));
await sharp({create:{width:1920,height:720,channels:4,background:{r:20,g:22,b:23,alpha:1}}}).composite([...newThumbs.map((input,index)=>({input,left:index*640,top:0})),...incumbentThumbs.map((input,index)=>({input,left:index*640,top:360}))]).png().toFile(comparison);
const cleanPresenterFrame=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const presenterForeground=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/presenter-depth-title-canary-v1/assets/ED-01/ed-01-person-only-foreground.png");
const cleanPresenterBuffer=await sharp(cleanPresenterFrame).resize(1920,1080,{fit:"fill"}).png().toBuffer();
const presenterContext=path.join(workDir,"ed01-word-actor-context-composite.png");
await sharp(cleanPresenterBuffer).composite([{input:transparent[0],left:0,top:0},{input:presenterForeground,left:0,top:0}]).png().toFile(presenterContext);
const [{data:typePixels,info:typeInfo},{data:personPixels}]=await Promise.all([sharp(transparent[0]).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(presenterForeground).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);
let visibleTypePixelCount=0;
let presenterTypeOverlapPixelCount=0;
for(let index=0;index<typeInfo.width*typeInfo.height;index+=1){const typeAlpha=typePixels[index*4+3];const personAlpha=personPixels[index*4+3];if(typeAlpha>5)visibleTypePixelCount+=1;if(typeAlpha>5&&personAlpha>5)presenterTypeOverlapPixelCount+=1;}
const presenterTypeOcclusionRatio=presenterTypeOverlapPixelCount/Math.max(1,visibleTypePixelCount);
fs.mkdirSync(publicDir,{recursive:true});
fs.copyFileSync(contactSheet,path.join(publicDir,"three-hero-word-actor-contact-sheet.png"));
fs.copyFileSync(comparison,path.join(publicDir,"three-hero-incumbent-comparison.png"));

const alphaChecks=[];
for(const file of transparent){const metadata=await sharp(file).metadata();const stats=await sharp(file).stats();alphaChecks.push(metadata.hasAlpha===true&&stats.isOpaque===false&&stats.channels[3]?.min===0&&stats.channels[3]?.max===255);}
const plans=planSet.items.map((item)=>item.plan);
const workspacePath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const checks={
  threeHeroPlans:plans.length===3&&plans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"),
  wordActorRichness:plans.reduce((sum,plan)=>sum+plan.actors.length,0)>=10&&Math.min(...plans.map((plan)=>plan.hierarchyRatio))>=4,
  controlledContact:plans.every((plan)=>plan.contacts.every((contact)=>contact.intentional&&contact.ratio>=.02&&contact.ratio<=.12)),
  persistentMaterials:new Set(plans.flatMap((plan)=>plan.actors.map((actor)=>actor.material))).size>=4,
  exactCopyShadow:plans.every((plan)=>plan.exactCopyShadow.length>0),
  typographyOnly:plans.every((plan)=>plan.authoredBackgroundPresent===false&&plan.standaloneDecorativeShapeCount===0),
  transparentOutputs:alphaChecks.every(Boolean),
  deterministicDuplicate:sha(holds[0])===sha(repeat),
  visualChangedFromBaseline:sha(contactSheet)!==baseline.sourceCompositionSha256,
  carrierEvidenceUnchanged:carriers.items.every((item)=>sha(path.join(root,item.file))===item.sha256),
  presenterContextReview:(await sharp(presenterContext).metadata()).width===1920&&presenterTypeOcclusionRatio>=.05&&presenterTypeOcclusionRatio<=.12,
  sixBlindFixtures:blind.status==="PASS"&&blind.fixtures.length===6,
  formalWorkspaceFrozen:sha(workspacePath)===baseline.formalWorkspaceFileSha256,
  formalBoardFrozen:sha(boardPath)===baseline.formalBoardManifestSha256,
};
const status=Object.values(checks).every(Boolean)?"PASS":"BLOCK";
const result={contract:"A1TypographyWordActorHeroCanaryResult/v1",status,fixtures:blind.fixtures,currentFilm:{heroPlanCount:plans.length,actorCount:plans.reduce((sum,plan)=>sum+plan.actors.length,0),archetypes:plans.map((plan)=>plan.archetype),minimumHierarchyRatio:Math.min(...plans.map((plan)=>plan.hierarchyRatio)),maximumContactRatio:Math.max(...plans.flatMap((plan)=>plan.contacts.map((contact)=>contact.ratio))),materials:[...new Set(plans.flatMap((plan)=>plan.actors.map((actor)=>actor.material)))]},visibleArtifact:{file:path.relative(root,contactSheet),sha256:sha(contactSheet),width:1920,height:3240},comparisonArtifact:{file:path.relative(root,comparison),sha256:sha(comparison),width:1920,height:720,topRow:"NEW_WORD_ACTOR_TYPE",bottomRow:"CURRENT_INCUMBENT_CONTEXT"},presenterContextArtifact:{file:path.relative(root,presenterContext),sha256:sha(presenterContext),sourceFrame:path.relative(root,cleanPresenterFrame),sourceFrameSha256:sha(cleanPresenterFrame),presenterForeground:path.relative(root,presenterForeground),presenterForegroundSha256:sha(presenterForeground),presenterTypeOcclusionRatio,sourcePixelsModified:false},transparentArtifacts:transparent.map((file,index)=>({id:props.items[index].id,file:path.relative(root,file),sha256:sha(file),hasAlpha:alphaChecks[index]})),formalAuthority:{workspaceFileSha256:sha(workspacePath),boardManifestSha256:sha(boardPath),unchanged:checks.formalWorkspaceFrozen&&checks.formalBoardFrozen},checks,productionAdmission:false};
write(path.join(workDir,"render-report.json"),result);
write(path.join(workDir,"result.json"),result);
console.log(JSON.stringify(result,null,2));
if(status!=="PASS")process.exitCode=1;
