#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const renderer=path.join(root,"remotion-renderer");
const workDir=path.join(root,"work/semantic-typography-composition-director-v1");
const publicDir=path.join(root,"apps/studio-next/public/generated/system-line/typography-director-v3");
const remotion=path.join(renderer,"node_modules/.bin/remotion");
const files={hold:path.join(workDir,"semantic-composition-contact-sheet.png"),peak:path.join(workDir,"semantic-composition-peak.png"),transparent:path.join(workDir,"semantic-composition-transparent.png"),repeat:path.join(workDir,"semantic-composition-contact-sheet-repeat.png")};
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const write=(file,value)=>fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,`utf8`);
const render=(composition,file,frame,props)=>execFileSync(remotion,["still","src/index.ts",composition,path.relative(renderer,file),`--frame=${frame}`,`--props=${props}`,"--image-format=png","--log=error"],{cwd:renderer,stdio:"inherit"});

fs.mkdirSync(workDir,{recursive:true});
render("A1TypographyFilmVocabularyCanaryV1",files.hold,100,"src/generated/typographyFilmVocabularyCanaryProps.json");
render("A1TypographyFilmVocabularyCanaryV1",files.peak,60,"src/generated/typographyFilmVocabularyCanaryProps.json");
render("A1TypographyFilmVocabularyTransparentCanaryV1",files.transparent,100,"src/generated/typographyFilmVocabularyTransparentCanaryProps.json");
render("A1TypographyFilmVocabularyCanaryV1",files.repeat,100,"src/generated/typographyFilmVocabularyCanaryProps.json");
fs.mkdirSync(publicDir,{recursive:true});
fs.copyFileSync(files.hold,path.join(publicDir,"real-copy-vocabulary-contact-sheet.png"));

const baseline=read(path.join(workDir,"baseline.json"));
const planSet=read(path.join(workDir,"composition-plans.json"));
const blind=read(path.join(workDir,"blind-fixture-report.json"));
const props=read(path.join(root,"work/single-film-typography-vocabulary-director-v1/canary-props.json"));
const holdMetadata=await sharp(files.hold).metadata();
const transparentMetadata=await sharp(files.transparent).metadata();
const transparentStats=await sharp(files.transparent).stats();
const workspacePath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const plans=planSet.items.map((item)=>item.plan);
const checks={
  sevenDistinctRecipes:planSet.recipeCount===7&&new Set(props.items.map((item)=>item.recipeId)).size===7,
  dominantGroups:plans.every((plan)=>Number.isInteger(plan.dominantGroupIndex)&&plan.groups[plan.dominantGroupIndex]),
  hierarchyAndAlignment:plans.filter((plan)=>plan.groups.length>1).every((plan)=>new Set(plan.groups.map((group)=>group.fontScale)).size>1)&&new Set(plans.flatMap((plan)=>plan.groups.map((group)=>group.horizontalAlign))).size>=2,
  perGroupEffectOwnership:plans.some((plan)=>new Set(plan.groups.map((group)=>group.effectOwnership)).size>1),
  geometrySafe:plans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"&&plan.ordinaryOverlapCount===0),
  typographyOnly:plans.every((plan)=>plan.authoredBackgroundPresent===false&&plan.standaloneDecorativeShapeCount===0&&plan.outputMode==="TRANSPARENT_GLYPH_ASSET"),
  actualPixels:holdMetadata.width===1920&&holdMetadata.height===1080,
  transparentOutput:transparentMetadata.hasAlpha===true&&transparentStats.isOpaque===false&&transparentStats.channels[3]?.min===0&&transparentStats.channels[3]?.max===255,
  deterministicDuplicate:sha(files.hold)===sha(files.repeat),
  visualChangedFromBaseline:sha(files.hold)!==baseline.sourceContactSheetSha256,
  sixBlindFixtures:blind.status==="PASS"&&blind.fixtures.length===6,
  formalWorkspaceFrozen:sha(workspacePath)===baseline.formalWorkspaceFileSha256,
  formalBoardFrozen:sha(boardPath)===baseline.formalBoardManifestSha256,
};
const status=Object.values(checks).every(Boolean)?"PASS":"BLOCK";
const result={contract:"A1SemanticTypographyCompositionDirectorResult/v1",status,fixtures:blind.fixtures,currentFilm:{eventCount:props.items.length,recipeCount:planSet.recipeCount,recipeIds:props.items.map((item)=>item.recipeId),activeEffectIds:props.activeEffectIds},visibleArtifact:{file:path.relative(root,files.hold),sha256:sha(files.hold),width:holdMetadata.width,height:holdMetadata.height},peakArtifact:{file:path.relative(root,files.peak),sha256:sha(files.peak)},transparentArtifact:{file:path.relative(root,files.transparent),sha256:sha(files.transparent),hasAlpha:transparentMetadata.hasAlpha,isOpaque:transparentStats.isOpaque},githubIntegration:{report:"work/semantic-typography-composition-director-v1/github-integration-research.md",newDependencyInstalled:false,mechanisms:["FIT_TO_INK_BOX","SEMANTIC_RELATION_LAYOUT","COLLISION_SAFE_CONSTRAINTS","PER_GROUP_EFFECT_OWNERSHIP"]},formalAuthority:{workspaceFileSha256:sha(workspacePath),boardManifestSha256:sha(boardPath),unchanged:checks.formalWorkspaceFrozen&&checks.formalBoardFrozen},checks,productionAdmission:false};
write(path.join(workDir,"render-report.json"),result);
write(path.join(workDir,"result.json"),result);
console.log(JSON.stringify(result,null,2));
if(status!=="PASS")process.exitCode=1;

