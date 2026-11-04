#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyFilmVocabularyV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {compileGeneratedTypographyStyleGenomeV1} from "../apps/studio-next/src/lib/a1-generated-typography-style-genome-v1.mjs";
import {compileTypographyBeatStateProgramV1,deriveTypographyBeatStateInputV1} from "../apps/studio-next/src/lib/a1-typography-beat-state-director-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const workDir=path.join(root,"work/single-film-typography-vocabulary-director-v1");
const compositionWorkDir=path.join(root,"work/semantic-typography-composition-director-v1");
const publicDir=path.join(root,"apps/studio-next/public/generated/system-line/typography-director-v3");
const generatedDir=path.join(root,"remotion-renderer/src/generated");
const sourceMapPath=path.join(root,"work/typography-director-v2/whole-film-typography-duty-map.json");
const blindPath=path.join(root,"work/typography-director-v2/blind-fixtures/report.json");
const workspacePath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const baseline=JSON.parse(fs.readFileSync(path.join(workDir,"baseline.json"),"utf8"));
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,"utf8");};
const workspaceBefore=shaFile(workspacePath);
const boardBefore=shaFile(boardPath);
if(workspaceBefore!==baseline.formalWorkspaceFileSha256)throw new Error("typography-vocabulary-workspace-baseline-drift");
if(boardBefore!==baseline.formalBoardManifestSha256)throw new Error("typography-vocabulary-board-baseline-drift");

const sourceMap=read(sourceMapPath);
const compilation=compileTypographyFilmVocabularyV1(sourceMap.assignments);
if(compilation.status!=="PASS_REVIEW_ONLY")throw new Error(`typography-vocabulary-current-blocked:${compilation.ledger.failures.map((item)=>item.code).join(",")}`);
const projectionBody={
  contract:"A1WholeFilmTypographyDirectorProjection/v3",
  status:"READY_FOR_USER_VISUAL_REVIEW",
  sourceDutyMapSha256:sourceMap.dutyMapSha256,
  vocabularyPlan:compilation.vocabularyPlan,
  assignments:compilation.items,
  sequenceLedger:compilation.ledger,
  v1ToV2Diff:sourceMap.v1ToV2Diff,
  summary:{...sourceMap.summary,previousEffectFamilyCount:sourceMap.summary.effectFamilyCount,previousTreatedShotCount:sourceMap.assignments.filter((item)=>item.effectProgram?.effectId!=="NONE").length,effectFamilyCount:compilation.vocabularyPlan.activeEffectFamilyCount,treatedShotCount:compilation.ledger.treatedShotCount,noEffectCount:compilation.ledger.noEffectShotCount,suppressedShotCount:compilation.ledger.suppressedShotIds.length,effectCounts:compilation.ledger.effectCounts,activeEffectIds:compilation.vocabularyPlan.activeEffectIds},
  approvalBoundary:{reviewOnly:true,userVisualApproval:"NOT_APPROVED",formalBoardMutationAllowed:false,productionAdmission:false},
  productionAdmission:false,
};
let projection={...projectionBody,projectionSha256:shaValue(projectionBody)};
write(path.join(workDir,"whole-film-typography-director-v3.json"),projection);
write(path.join(publicDir,"whole-film-typography-director-v3.json"),projection);

const blind=read(blindPath);
const fixtures=blind.reports.map((report)=>{
  const result=compileTypographyFilmVocabularyV1(report.assignments);
  return {id:report.articleId,genre:report.genre,programMode:result.vocabularyPlan.primaryProgramMode,status:result.status,effectFamilyCount:result.vocabularyPlan.activeEffectFamilyCount,treatedShotCount:result.ledger.treatedShotCount,shotCount:result.ledger.shotCount,activeEffectIds:result.vocabularyPlan.activeEffectIds,failures:result.ledger.failures,planSha256:result.vocabularyPlan.planSha256};
});
const blindReport={contract:"A1TypographyFilmVocabularyBlindFixtureReport/v1",status:fixtures.length===6&&fixtures.every((item)=>item.status==="PASS_REVIEW_ONLY"&&item.effectFamilyCount<=5)?"PASS":"BLOCK",fixtureCount:fixtures.length,fixtures,productionAdmission:false};
write(path.join(workDir,"blind-fixture-report.json"),blindReport);
if(blindReport.status!=="PASS")throw new Error("typography-vocabulary-blind-fixtures-blocked");

const fonts={
  SANS:{fontId:"source-han-sans-heavy",fontProfile:"SANS_HEAVY",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf")},
  SERIF:{fontId:"source-han-serif-heavy",fontProfile:"EVA_MINCHO",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf")},
  LATIN:{fontId:"times-new-roman-bold-system",fontProfile:"EVA_LATIN",fontFile:"/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"},
  PIXEL:{fontId:"fusion-pixel",fontProfile:"FUSION_PIXEL",fontFile:path.join(root,"apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf")},
};
const fontFor=(effectId,text)=>effectId==="PIXEL_TRACKING_LOCK"?fonts.PIXEL:effectId==="EVA_COMPRESS"?(/^[\x00-\x7F\s]+$/u.test(text)?fonts.LATIN:fonts.SERIF):fonts.SANS;
const sizeFor=(effectId,text)=>effectId==="PIXEL_TRACKING_LOCK"?54:effectId==="EVA_COMPRESS"?(/^[\x00-\x7F\s]+$/u.test(text)?74:108):effectId==="CLEAN_EDITORIAL"?66:88;
const selected=projection.assignments.filter((item)=>item.filmEffectProgram.effectId!=="NONE");
const compositionPlans=selected.map((item)=>({shotId:item.shotId,plan:compileTypographyCompositionV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent})}));
if(compositionPlans.some((item)=>item.plan.status!=="PASS_REVIEW_ONLY"))throw new Error(`typography-composition-current-blocked:${compositionPlans.filter((item)=>item.plan.status!=="PASS_REVIEW_ONLY").map((item)=>item.shotId).join(",")}`);
const planByShot=new Map(compositionPlans.map((item)=>[item.shotId,item.plan]));
{
  const {projectionSha256:_previousProjectionSha,...rest}=projection;
  const enrichedBody={...rest,assignments:projection.assignments.map((item)=>({...item,compositionPlan:planByShot.get(item.shotId)||null})),compositionSummary:{contract:"A1TypographyCompositionSummary/v1",recipeCount:new Set(compositionPlans.map((item)=>item.plan.recipeId)).size,recipeIds:compositionPlans.map((item)=>item.plan.recipeId),ordinaryOverlapCount:compositionPlans.reduce((sum,item)=>sum+item.plan.ordinaryOverlapCount,0),authoredBackgroundPresent:false,productionAdmission:false}};
  projection={...enrichedBody,projectionSha256:shaValue(enrichedBody)};
  write(path.join(workDir,"whole-film-typography-director-v3.json"),projection);
  write(path.join(publicDir,"whole-film-typography-director-v3.json"),projection);
}
const generatedTypography=compileGeneratedTypographyStyleGenomeV1(projection.assignments);
if(generatedTypography.status!=="PASS_REVIEW_ONLY")throw new Error(`generated-typography-style-genome-blocked:${generatedTypography.sequenceLedger.failures.map((item)=>item.code).join(",")}`);
const generatedAnchorManifestPath=path.join(root,"work/typography-imagegen-design-directions-v1/manifest.json");
const generatedTypographyAnchors=[];
if(fs.existsSync(generatedAnchorManifestPath)){
  const anchorManifest=read(generatedAnchorManifestPath);
  for(const item of anchorManifest.items||[]){
    const source=path.join(root,item.file);
    if(!fs.existsSync(source)||shaFile(source)!==item.sha256)throw new Error(`generated-typography-anchor-drift:${item.id}`);
    const fileName=path.basename(source);
    const target=path.join(publicDir,"generated-style-anchors",fileName);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(source,target);
    generatedTypographyAnchors.push({...item,status:"USER_PREFERRED_STYLE_REFERENCE",publicUrl:`/generated/system-line/typography-director-v3/generated-style-anchors/${fileName}`,productionAdmission:false});
  }
}
{
  const {projectionSha256:_previousProjectionSha,...rest}=projection;
  const generatedBody={
    ...rest,
    assignments:generatedTypography.items,
    generatedTypographyStyleGenome:generatedTypography.styleGenome,
    generatedTypographySequenceLedger:generatedTypography.sequenceLedger,
    generatedTypographyAnchors,
    summary:{
      ...rest.summary,
      generatedTypographyEventCount:generatedTypography.sequenceLedger.generatedEventCount,
      generatedTypographyQuietBeatCount:generatedTypography.sequenceLedger.quietBeatCount,
      generatedTypographyQuietBeatRatio:generatedTypography.sequenceLedger.quietBeatRatio,
      generatedTypographyActiveFamilies:generatedTypography.styleGenome.richnessBudget.activeFamilies,
      generatedTypographyStyleId:generatedTypography.styleGenome.articleProfile.styleId,
    },
  };
  projection={...generatedBody,projectionSha256:shaValue(generatedBody)};
  write(path.join(workDir,"whole-film-typography-director-v3.json"),projection);
  write(path.join(publicDir,"whole-film-typography-director-v3.json"),projection);
  write(path.join(workDir,"generated-typography-style-genome-v1.json"),generatedTypography.styleGenome);
  write(path.join(publicDir,"generated-typography-style-genome-v1.json"),generatedTypography.styleGenome);
  write(path.join(workDir,"generated-typography-sequence-ledger-v1.json"),generatedTypography.sequenceLedger);
  write(path.join(publicDir,"generated-typography-sequence-ledger-v1.json"),generatedTypography.sequenceLedger);
  write(path.join(workDir,"generated-typography-prompt-plan-v1.json"),{contract:"A1GeneratedTypographyPromptPlan/v1",status:"PASS_REVIEW_ONLY",styleGenomeSha256:generatedTypography.styleGenome.styleGenomeSha256,items:generatedTypography.items.map((item)=>item.generatedTypographyPlan),productionAdmission:false});
  write(path.join(publicDir,"generated-typography-prompt-plan-v1.json"),{contract:"A1GeneratedTypographyPromptPlan/v1",status:"PASS_REVIEW_ONLY",styleGenomeSha256:generatedTypography.styleGenome.styleGenomeSha256,items:generatedTypography.items.map((item)=>item.generatedTypographyPlan),productionAdmission:false});
}
const typographyBeatStatePrograms=projection.assignments.filter((item)=>item.generatedTypographyPlan?.decision==="GENERATE").map((item)=>compileTypographyBeatStateProgramV1(deriveTypographyBeatStateInputV1(item)));
if(typographyBeatStatePrograms.some((program)=>program.status!=="PASS_REVIEW_ONLY"))throw new Error(`typography-beat-state-program-blocked:${typographyBeatStatePrograms.filter((program)=>program.status!=="PASS_REVIEW_ONLY").map((program)=>`${program.beatId}:${program.failures.map((failure)=>failure.code).join("+")}`).join(",")}`);
const typographyBeatStateByShot=new Map(typographyBeatStatePrograms.map((program)=>[program.beatId,program]));
const typographyBeatStateActionCounts=Object.fromEntries([...new Set(typographyBeatStatePrograms.flatMap((program)=>program.orderedEvents.map((event)=>event.action)))].map((action)=>[action,typographyBeatStatePrograms.flatMap((program)=>program.orderedEvents).filter((event)=>event.action===action).length]));
{
  const {projectionSha256:_previousProjectionSha,...rest}=projection;
  const beatStateBody={
    ...rest,
    assignments:projection.assignments.map((item)=>({...item,typographyBeatStateProgram:typographyBeatStateByShot.get(item.shotId)||null})),
    typographyBeatStateSummary:{contract:"A1TypographyBeatStateProgramSummary/v1",status:"PASS_REVIEW_ONLY",programCount:typographyBeatStatePrograms.length,actionCounts:typographyBeatStateActionCounts,stateFingerprints:typographyBeatStatePrograms.map((program)=>({shotId:program.beatId,stateFingerprint:program.stateFingerprint})),productionAdmission:false},
    summary:{...rest.summary,typographyBeatStateProgramCount:typographyBeatStatePrograms.length,typographyBeatStateActionCounts},
  };
  projection={...beatStateBody,projectionSha256:shaValue(beatStateBody)};
  write(path.join(workDir,"whole-film-typography-director-v3.json"),projection);
  write(path.join(publicDir,"whole-film-typography-director-v3.json"),projection);
  write(path.join(workDir,"typography-beat-state-programs-v1.json"),{contract:"A1TypographyBeatStateProgramSet/v1",status:"PASS_REVIEW_ONLY",items:typographyBeatStatePrograms,actionCounts:typographyBeatStateActionCounts,productionAdmission:false});
  write(path.join(publicDir,"typography-beat-state-programs-v1.json"),{contract:"A1TypographyBeatStateProgramSet/v1",status:"PASS_REVIEW_ONLY",items:typographyBeatStatePrograms,actionCounts:typographyBeatStateActionCounts,productionAdmission:false});
}
const canaryItems=selected.map((item)=>{
  const composition=planByShot.get(item.shotId);
  return{
    shotId:item.shotId,
    role:item.typographyRole,
    effectId:item.filmEffectProgram.effectId,
    intensity:item.filmEffectProgram.intensity,
    recipeId:composition.recipeId,
    dominantGroupIndex:composition.dominantGroupIndex,
    groups:composition.groups.map((layout)=>{
      const text=layout.text;
      const effectId=layout.effectOwnership;
      const font=fontFor(effectId,text);
      return {manifest:compileFontkitGlyphPathManifestV1({manifestId:`film-composition-${item.sourceIndex}-${layout.index}`,genre:"current-film-review",exactCopy:text,fontProfile:font.fontProfile,fontId:font.fontId,fontFile:font.fontFile,semanticGroups:[text]}),fontSize:sizeFor(effectId,text)*layout.fontScale,effectId,layout};
    }),
  };
});
const canaryProps={contract:"A1TypographyFilmVocabularyCanaryProps/v1",width:1920,height:1080,fps:30,durationInFrames:150,reviewPlate:true,items:canaryItems,activeEffectIds:projection.vocabularyPlan.activeEffectIds,productionAdmission:false};
write(path.join(generatedDir,"typographyFilmVocabularyCanaryProps.json"),canaryProps);
write(path.join(generatedDir,"typographyFilmVocabularyTransparentCanaryProps.json"),{...canaryProps,reviewPlate:false});
write(path.join(workDir,"canary-props.json"),canaryProps);
write(path.join(compositionWorkDir,"composition-plans.json"),{contract:"A1TypographyCompositionPlanSet/v1",status:"PASS_REVIEW_ONLY",sourceProjectionSha256:projection.projectionSha256,items:compositionPlans,recipeCount:new Set(compositionPlans.map((item)=>item.plan.recipeId)).size,productionAdmission:false});

const workspaceAfter=shaFile(workspacePath);
const boardAfter=shaFile(boardPath);
const buildReport={contract:"A1TypographyFilmVocabularyBuildReport/v1",status:workspaceBefore===workspaceAfter&&boardBefore===boardAfter?"PASS":"BLOCK",projectionSha256:projection.projectionSha256,summary:projection.summary,fixtures,canaryItemCount:canaryItems.length,uniqueCopyCount:new Set(canaryItems.flatMap((item)=>item.groups.map((group)=>group.manifest.exactCopy))).size,compositionRecipeCount:new Set(compositionPlans.map((item)=>item.plan.recipeId)).size,generatedTypography:{styleGenomeSha256:generatedTypography.styleGenome.styleGenomeSha256,styleId:generatedTypography.styleGenome.articleProfile.styleId,activeFamilies:generatedTypography.styleGenome.richnessBudget.activeFamilies,generatedEventCount:generatedTypography.sequenceLedger.generatedEventCount,quietBeatRatio:generatedTypography.sequenceLedger.quietBeatRatio,sequenceLedgerSha256:generatedTypography.sequenceLedger.ledgerSha256},typographyBeatState:{programCount:typographyBeatStatePrograms.length,actionCounts:typographyBeatStateActionCounts,stateFingerprints:typographyBeatStatePrograms.map((program)=>({shotId:program.beatId,stateFingerprint:program.stateFingerprint}))},formalAuthority:{workspaceBefore,workspaceAfter,boardBefore,boardAfter,unchanged:workspaceBefore===workspaceAfter&&boardBefore===boardAfter},productionAdmission:false};
write(path.join(workDir,"build-report.json"),buildReport);
console.log(JSON.stringify(buildReport,null,2));
if(buildReport.status!=="PASS")process.exitCode=1;
