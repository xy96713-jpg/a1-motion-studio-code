#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const rendererDir=path.join(root,"remotion-renderer");
const outputDir=path.join(root,"work/fontkit-remotion-paths-glyph-adapter-v1");
const remotion=path.join(rendererDir,"node_modules/.bin/remotion");
const entry="src/index.ts";
const reviewProps="src/generated/glyphPathAdapterCanaryProps.json";
const transparentProps="src/generated/glyphPathAdapterTransparentCanaryProps.json";
const render=(composition,file,frame,props)=>execFileSync(remotion,["still",entry,composition,path.relative(rendererDir,file),`--frame=${frame}`,`--props=${props}`,"--image-format=png","--log=error"],{cwd:rendererDir,stdio:"inherit"});
const sha256=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson=(file,value)=>fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,"utf8");

fs.mkdirSync(outputDir,{recursive:true});
const files={
  enter:path.join(outputDir,"frame-enter.png"),
  peak:path.join(outputDir,"frame-peak.png"),
  hold:path.join(outputDir,"frame-hold.png"),
  transparent:path.join(outputDir,"frame-hold-transparent.png"),
  repeat:path.join(outputDir,"frame-hold-repeat.png"),
  contactSheet:path.join(outputDir,"glyph-path-adapter-contact-sheet.png"),
};

render("A1GlyphPathAdapterCanaryV1",files.enter,36,reviewProps);
render("A1GlyphPathAdapterCanaryV1",files.peak,60,reviewProps);
render("A1GlyphPathAdapterCanaryV1",files.hold,100,reviewProps);
render("A1GlyphPathAdapterTransparentCanaryV1",files.transparent,100,transparentProps);
render("A1GlyphPathAdapterCanaryV1",files.repeat,100,reviewProps);

await sharp({create:{width:1920,height:2160,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([
    {input:files.enter,left:0,top:0},
    {input:files.peak,left:0,top:720},
    {input:files.hold,left:0,top:1440},
  ])
  .png()
  .toFile(files.contactSheet);

const frameMetadata=Object.fromEntries(await Promise.all(Object.entries({enter:files.enter,peak:files.peak,hold:files.hold,transparent:files.transparent,repeat:files.repeat}).map(async([id,file])=>[id,{file:path.relative(root,file),sha256:sha256(file),metadata:await sharp(file).metadata()}])));
const transparentStats=await sharp(files.transparent).stats();
const baseline=JSON.parse(fs.readFileSync(path.join(outputDir,"baseline.json"),"utf8"));
const manifestReport=JSON.parse(fs.readFileSync(path.join(outputDir,"manifest-report.json"),"utf8"));
const formalWorkspace=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const formalBoard=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const formalWorkspaceFileSha256=sha256(formalWorkspace);
const formalBoardManifestSha256=sha256(formalBoard);
const checks={
  frameDimensions:Object.values(frameMetadata).every(({metadata})=>metadata.width===1920&&metadata.height===720),
  duplicateHoldDeterministic:frameMetadata.hold.sha256===frameMetadata.repeat.sha256,
  transparentPngHasAlpha:frameMetadata.transparent.metadata.hasAlpha===true&&transparentStats.isOpaque===false&&transparentStats.channels[3]?.min===0&&transparentStats.channels[3]?.max===255,
  sixBlindFixtures:manifestReport.status==="PASS"&&manifestReport.fixtureCount===6,
  formalWorkspaceFrozen:formalWorkspaceFileSha256===baseline.formalWorkspaceFileSha256,
  formalBoardFrozen:formalBoardManifestSha256===baseline.formalBoardManifestSha256,
};
const status=Object.values(checks).every(Boolean)?"PASS":"BLOCK";
const result={
  contract:"A1FontkitRemotionPathsGlyphAdapterResult/v1",
  status,
  effectCount:10,
  buildTimeCompiler:"fontkit@2.0.4",
  runtimePathEngine:"@remotion/paths@4.0.520",
  runtimeFontParserAllowed:false,
  secondRendererIntroduced:false,
  productionAdmission:false,
  fixtures:manifestReport.fixtures,
  frames:frameMetadata,
  transparentAlpha:{isOpaque:transparentStats.isOpaque,min:transparentStats.channels[3]?.min,max:transparentStats.channels[3]?.max},
  contactSheet:{file:path.relative(root,files.contactSheet),sha256:sha256(files.contactSheet),width:1920,height:2160},
  formalAuthority:{workspaceFileSha256:formalWorkspaceFileSha256,boardManifestSha256:formalBoardManifestSha256,unchanged:checks.formalWorkspaceFrozen&&checks.formalBoardFrozen},
  checks,
};
writeJson(path.join(outputDir,"render-report.json"),result);
writeJson(path.join(outputDir,"result.json"),result);
console.log(JSON.stringify(result,null,2));
if(status!=="PASS")process.exitCode=1;
