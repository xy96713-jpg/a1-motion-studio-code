#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const renderer=path.join(root,"remotion-renderer");
const workDir=path.join(root,"work/single-film-typography-vocabulary-director-v1");
const publicDir=path.join(root,"apps/studio-next/public/generated/system-line/typography-director-v3");
const remotion=path.join(renderer,"node_modules/.bin/remotion");
const visible=path.join(workDir,"real-copy-vocabulary-contact-sheet.png");
const transparent=path.join(workDir,"real-copy-vocabulary-transparent.png");
const repeat=path.join(workDir,"real-copy-vocabulary-contact-sheet-repeat.png");
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const write=(file,value)=>fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,"utf8");
const render=(composition,file,props)=>execFileSync(remotion,["still","src/index.ts",composition,path.relative(renderer,file),"--frame=100",`--props=${props}`,"--image-format=png","--log=error"],{cwd:renderer,stdio:"inherit"});

render("A1TypographyFilmVocabularyCanaryV1",visible,"src/generated/typographyFilmVocabularyCanaryProps.json");
render("A1TypographyFilmVocabularyTransparentCanaryV1",transparent,"src/generated/typographyFilmVocabularyTransparentCanaryProps.json");
render("A1TypographyFilmVocabularyCanaryV1",repeat,"src/generated/typographyFilmVocabularyCanaryProps.json");
fs.mkdirSync(publicDir,{recursive:true});
fs.copyFileSync(visible,path.join(publicDir,"real-copy-vocabulary-contact-sheet.png"));

const metadata=await sharp(visible).metadata();
const transparentMetadata=await sharp(transparent).metadata();
const transparentStats=await sharp(transparent).stats();
const projection=read(path.join(workDir,"whole-film-typography-director-v3.json"));
const blind=read(path.join(workDir,"blind-fixture-report.json"));
const props=read(path.join(workDir,"canary-props.json"));
const baseline=read(path.join(workDir,"baseline.json"));
const workspacePath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const eventCopies=props.items.map((item)=>item.groups.map((group)=>group.manifest.exactCopy).join(" / "));
const checks={
  currentFilmFourPlusOne:projection.summary.effectFamilyCount===5&&projection.vocabularyPlan.coreEffectIds.length===4&&projection.vocabularyPlan.microEffectIds.length===1,
  treatedShotBudget:projection.summary.treatedShotCount===7&&projection.summary.noEffectCount===27,
  realCopyEventsUnique:props.items.length===7&&new Set(eventCopies).size===7,
  actualPixels:metadata.width===1920&&metadata.height===1080,
  transparentOutput:transparentMetadata.hasAlpha===true&&transparentStats.isOpaque===false&&transparentStats.channels[3]?.min===0&&transparentStats.channels[3]?.max===255,
  deterministicDuplicate:sha(visible)===sha(repeat),
  blindFixtures:blind.status==="PASS"&&blind.fixtureCount===6,
  formalWorkspaceFrozen:sha(workspacePath)===baseline.formalWorkspaceFileSha256,
  formalBoardFrozen:sha(boardPath)===baseline.formalBoardManifestSha256,
};
const status=Object.values(checks).every(Boolean)?"PASS":"BLOCK";
const result={contract:"A1SingleFilmTypographyVocabularyDirectorResult/v1",status,fixtures:blind.fixtures,currentFilm:{projectionSha256:projection.projectionSha256,primaryProgramMode:projection.vocabularyPlan.primaryProgramMode,globalLibraryEffectCount:projection.vocabularyPlan.globalLibraryEffectCount,activeEffectIds:projection.vocabularyPlan.activeEffectIds,activeEffectFamilyCount:projection.summary.effectFamilyCount,treatedShotCount:projection.summary.treatedShotCount,noEffectShotCount:projection.summary.noEffectCount,suppressedShotCount:projection.summary.suppressedShotCount,selectedShotIds:projection.sequenceLedger.selectedShotIds},visibleArtifact:{file:path.relative(root,visible),sha256:sha(visible),width:metadata.width,height:metadata.height,eventCopies},transparentArtifact:{file:path.relative(root,transparent),sha256:sha(transparent),hasAlpha:transparentMetadata.hasAlpha,isOpaque:transparentStats.isOpaque},formalAuthority:{workspaceFileSha256:sha(workspacePath),boardManifestSha256:sha(boardPath),unchanged:checks.formalWorkspaceFrozen&&checks.formalBoardFrozen},checks,productionAdmission:false};
write(path.join(workDir,"render-report.json"),result);
write(path.join(workDir,"result.json"),result);
console.log(JSON.stringify(result,null,2));
if(status!=="PASS")process.exitCode=1;

