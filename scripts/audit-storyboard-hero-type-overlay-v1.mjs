#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const manifestPath = path.join(root, "remotion-renderer/src/generated/heroTypeOverlays.json");
const rendererPath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const renderer = fs.readFileSync(rendererPath, "utf8");
const checks = [];

checks.push({id:"manifest-contract",pass:manifest.contract==="A1HeroTypeOverlayManifest/v1"});
checks.push({id:"overlay-present",pass:Array.isArray(manifest.overlays)&&manifest.overlays.length>0});
checks.push({id:"renderer-transparent-overlay-route",pass:renderer.includes("HeroTypeOverlay")&&renderer.includes('data-a1-hero-type-background="none"')&&renderer.includes("if(heroTypeOverlay) return")});

for (const overlay of manifest.overlays||[]) {
  const assetPath = path.join(root, "remotion-renderer/public", overlay.asset);
  const metadata = fs.existsSync(assetPath) ? await sharp(assetPath).metadata() : null;
  checks.push({id:`${overlay.beatId}:asset-exists`,pass:Boolean(metadata),evidence:overlay.asset});
  checks.push({id:`${overlay.beatId}:alpha`,pass:Boolean(metadata?.hasAlpha&&metadata?.channels===4),evidence:metadata?{width:metadata.width,height:metadata.height,channels:metadata.channels,hasAlpha:metadata.hasAlpha}:null});
  checks.push({id:`${overlay.beatId}:overlay-only`,pass:overlay.backgroundAllowed===false&&overlay.supportingGraphicsAllowed===false&&overlay.alphaRequired===true});
  checks.push({id:`${overlay.beatId}:exact-text`,pass:overlay.text===overlay.editableSourceText&&overlay.text==="智能写作工作台"});
  if (overlay.englishAsset) {
    const englishAssetPath = path.join(root, "remotion-renderer/public", overlay.englishAsset);
    const englishMetadata = fs.existsSync(englishAssetPath) ? await sharp(englishAssetPath).metadata() : null;
    checks.push({id:`${overlay.beatId}:english-asset-alpha`,pass:Boolean(englishMetadata?.hasAlpha&&englishMetadata?.channels===4),evidence:englishMetadata?{width:englishMetadata.width,height:englishMetadata.height,channels:englishMetadata.channels,hasAlpha:englishMetadata.hasAlpha}:null});
    checks.push({id:`${overlay.beatId}:english-exact-text`,pass:overlay.englishText==="WORKBENCH"});
  }
}

const blockers = checks.filter((check)=>!check.pass);
const report = {
  contract:"A1StoryboardHeroTypeOverlayAudit/v1",
  status:blockers.length?"FAIL":"PASS",
  generatedAt:new Date().toISOString(),
  summary:{checkCount:checks.length,passCount:checks.length-blockers.length,failCount:blockers.length},
  checks:checks.map((check)=>({...check,status:check.pass?"PASS":"FAIL"})),
  blockers,
};
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-hero-type-overlay-v1/report.json");
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,summary:report.summary,reportPath:path.relative(root,reportPath)},null,2));
if(blockers.length) process.exitCode=2;
