#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyWordActorsV1} from "../apps/studio-next/src/lib/a1-typography-word-actor-director-v1.mjs";
import {compileTypographyFilmVocabularyV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const workDir=path.join(root,"work/typography-word-actor-hero-canary-v1");
const generatedDir=path.join(root,"remotion-renderer/src/generated");
const projection=JSON.parse(fs.readFileSync(path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"),"utf8"));
const blind=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/blind-fixtures/report.json"),"utf8"));
const baseline=JSON.parse(fs.readFileSync(path.join(workDir,"baseline.json"),"utf8"));
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,`utf8`);};
const workspacePath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
if(sha(workspacePath)!==baseline.formalWorkspaceFileSha256)throw new Error("word-actor-workspace-baseline-drift");
if(sha(boardPath)!==baseline.formalBoardManifestSha256)throw new Error("word-actor-board-baseline-drift");

const fonts={
  EVA_LATIN:{fontId:"times-new-roman-bold-system",fontFile:"/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"},
  EVA_MINCHO:{fontId:"source-han-serif-heavy",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf")},
  SANS_HEAVY:{fontId:"source-han-sans-heavy",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf")},
  FUSION_PIXEL:{fontId:"fusion-pixel",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf")},
};
const baseSize=(profile)=>profile==="EVA_LATIN"?180:profile==="FUSION_PIXEL"?140:240;
const heroAssignments=projection.assignments.filter((item)=>["PRESENTER_HERO","FULLSCREEN_HERO","CONCLUSION_STAMP"].includes(item.typographyRole));
const plans=heroAssignments.map((item)=>({id:item.shotId,plan:compileTypographyWordActorsV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent,exactCopy:item.exactCopy})}));
if(plans.length!==3||plans.some((item)=>item.plan.status!=="PASS_REVIEW_ONLY"))throw new Error("word-actor-current-hero-plan-blocked");
const items=plans.map(({id,plan})=>({id,role:plan.typographyRole,archetype:plan.archetype,exactCopyShadow:plan.exactCopyShadow,dominantActorId:plan.dominantActorId,actors:plan.actors.map((actor)=>{
  const font=fonts[actor.fontProfile];
  if(!font)throw new Error(`word-actor-font-profile:${actor.fontProfile}`);
  return{...actor,manifest:compileFontkitGlyphPathManifestV1({manifestId:`word-actor-${id.toLowerCase()}-${actor.id}`,genre:"current-film-hero-review",exactCopy:actor.text,fontProfile:actor.fontProfile,fontId:font.fontId,fontFile:font.fontFile,semanticGroups:[actor.text]}),fontSize:baseSize(actor.fontProfile)*actor.fontScale};
})}));
const props={contract:"A1TypographyHeroWordActorCanaryProps/v1",width:1920,height:1080,fps:30,durationInFrames:150,reviewPlate:true,itemIndex:0,items,productionAdmission:false};
write(path.join(generatedDir,"typographyHeroWordActorCanaryProps.json"),props);
write(path.join(generatedDir,"typographyHeroWordActorTransparentCanaryProps.json"),{...props,reviewPlate:false});
for(let index=0;index<items.length;index+=1){
  write(path.join(generatedDir,`typographyHeroWordActorCanaryProps-${index}.json`),{...props,itemIndex:index});
  write(path.join(generatedDir,`typographyHeroWordActorTransparentCanaryProps-${index}.json`),{...props,itemIndex:index,reviewPlate:false});
}
write(path.join(workDir,"word-actor-plans.json"),{contract:"A1TypographyWordActorPlanSet/v1",status:"PASS_REVIEW_ONLY",items:plans,productionAdmission:false});
write(path.join(workDir,"canary-props.json"),props);

const fixtures=blind.reports.map((report)=>{
  const vocabulary=compileTypographyFilmVocabularyV1(report.assignments);
  const heroPlans=vocabulary.items.filter((item)=>["PRESENTER_HERO","FULLSCREEN_HERO","CONCLUSION_STAMP"].includes(item.typographyRole)&&item.filmEffectProgram.effectId!=="NONE").map((item)=>compileTypographyWordActorsV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent,exactCopy:item.exactCopy}));
  return{id:report.articleId,genre:report.genre,status:heroPlans.every((plan)=>plan.status==="PASS_REVIEW_ONLY")?"PASS":"BLOCK",heroPlanCount:heroPlans.length,archetypes:[...new Set(heroPlans.map((plan)=>plan.archetype))],minimumHierarchyRatio:heroPlans.length?Math.min(...heroPlans.map((plan)=>plan.hierarchyRatio)):null};
});
const blindReport={contract:"A1TypographyWordActorBlindFixtureReport/v1",status:fixtures.length===6&&fixtures.every((item)=>item.status==="PASS")?"PASS":"BLOCK",fixtures,productionAdmission:false};
write(path.join(workDir,"blind-fixture-report.json"),blindReport);

const carriers=[
  {id:"ED-01",file:"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/frames/ED-01.png"},
  {id:"ED-10",file:"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/ed10-direction-c-eva-editable-layer-v1/actual-pixel-proof.png"},
  {id:"ED-34",file:"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/three-anchor-visual-repair-v1/ED-34-anchor.png"},
].map((item)=>({...item,sha256:sha(path.join(root,item.file))}));
write(path.join(workDir,"carrier-evidence.json"),{contract:"A1TypographyHeroCarrierEvidence/v1",status:"PASS_READ_ONLY",items:carriers,usage:"INCUMBENT_COMPARISON_ONLY",sourcePixelsModified:false,productionAdmission:false});
const report={contract:"A1TypographyWordActorHeroBuildReport/v1",status:blindReport.status==="PASS"?"PASS":"BLOCK",heroPlanCount:plans.length,actorCount:plans.reduce((sum,item)=>sum+item.plan.actors.length,0),archetypes:plans.map((item)=>item.plan.archetype),minimumHierarchyRatio:Math.min(...plans.map((item)=>item.plan.hierarchyRatio)),maximumContactRatio:Math.max(...plans.flatMap((item)=>item.plan.contacts.map((contact)=>contact.ratio))),persistentMaterialActorCount:plans.reduce((sum,item)=>sum+item.plan.persistentMaterialActorIds.length,0),fixtures,formalAuthority:{workspaceFileSha256:sha(workspacePath),boardManifestSha256:sha(boardPath),unchanged:true},productionAdmission:false};
write(path.join(workDir,"build-report.json"),report);
console.log(JSON.stringify(report,null,2));
if(report.status!=="PASS")process.exitCode=1;
