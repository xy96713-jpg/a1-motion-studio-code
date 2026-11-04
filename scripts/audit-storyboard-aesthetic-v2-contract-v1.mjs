#!/usr/bin/env node
/**
 * Aesthetic v2 gate: keeps the storyboard renderer aligned to the approved
 * cool retro-print archive references without exposing extra UI.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-aesthetic-v2-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const sources = {
  renderer: "remotion-renderer/src/MicrobeatLayeredFullReview.tsx",
  fontRegistry: "remotion-renderer/src/experimentalEditorialFonts.ts",
  serifDisplayFont: "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSerifCN/SourceHanSerifCN-Heavy.otf",
  chineseDisplayManifest: "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/GoogleDisplayCN/manifest.json",
  latinDisplayManifest: "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/GoogleLatinDisplay/manifest.json",
  typeArtPlateManifest: "remotion-renderer/src/generated/typeArtPlates.json",
  typeArtPlateReport: "apps/studio-next/public/generated/system-line/storyboard-type-art-plates-v1/report.json",
  visualQualitySample: "apps/studio-next/public/generated/system-line/storyboard-visual-quality-sample-v1/report.json",
  motionTemporalProof: "apps/studio-next/public/generated/system-line/storyboard-motion-temporal-proof-v1/report.json",
};
function read(relativePath){return fs.readFileSync(path.join(root, relativePath), "utf8");}
function readJson(relativePath){const p=path.join(root, relativePath);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):null;}
function writeJson(filePath,value){fs.mkdirSync(path.dirname(filePath),{recursive:true});fs.writeFileSync(filePath, JSON.stringify(value,null,2)+"\n", "utf8");}
const renderer = read(sources.renderer);
const fontRegistry = read(sources.fontRegistry);
const visual = readJson(sources.visualQualitySample);
const motion = readJson(sources.motionTemporalProof);
const typeArtPlates = readJson(sources.typeArtPlateManifest);
const typeArtPlateReport = readJson(sources.typeArtPlateReport);
const markers = {
  aestheticRoot: (renderer.match(/data-a1-aesthetic-v2/g)||[]).length,
  coolPalette: renderer.includes("cool-offwhite-cobalt-archive-green"),
  blueGreenLayer: renderer.includes("blue-green-wireframe-registration"),
  condensedType: renderer.includes("condensed-print-registration"),
  coolPlate: renderer.includes("cool-translucent"),
  referencePosterType: renderer.includes("reference-poster-type-v2"),
  referenceCinemaType: renderer.includes("reference-cinema-condensed-type-v2"),
  yellowPosterDefault: renderer.includes('if(preset==="poster-slam")return typeTaste.neonYellow'),
  redCinemaDefault: renderer.includes('if(preset==="cinema-condensed")return typeTaste.opticRed'),
  cjkDisplayStack: renderer.includes("posterCjkSerifDisplay") && renderer.includes("Songti SC") && renderer.includes("STSong"),
  serifFontRegistered: fontRegistry.includes("posterCjkSerifDisplay") && fs.existsSync(path.join(root, sources.serifDisplayFont)),
  chineseDisplayPoolRegistered: ["zcoolKuaiLe","zcoolXiaoWei","maShanZheng","longCang"].every((token)=>fontRegistry.includes(token)) && fs.existsSync(path.join(root, sources.chineseDisplayManifest)),
  latinDisplayPoolRegistered: ["latinAnton","latinOswald","latinArchivoBlack","latinBarlowCondensed"].every((token)=>fontRegistry.includes(token)) && fs.existsSync(path.join(root, sources.latinDisplayManifest)),
  latinFontPackRouter: renderer.includes("latinFontPackFor") && renderer.includes("anton-red-cinema") && renderer.includes("barlow-yellow-poster"),
  darkroomCropPlate: renderer.includes("social-video-title-crop") && renderer.includes("short-video-letterbox-title"),
  editableTypeArtPlateGenerator: typeArtPlateReport?.status === "PASS" && typeArtPlates?.contract === "A1StoryboardTypeArtPlateManifest/v1" && Array.isArray(typeArtPlates?.plates) && typeArtPlates.plates.length > 0 && typeArtPlates.plates.every((plate)=>Array.isArray(plate.glyphs)&&plate.glyphs.length===Array.from(plate.text||"").length&&plate.glyphs.every((glyph)=>typeof glyph.pathData === "string")) && renderer.includes("EditableTypeArtPlate") && renderer.includes("typeArtPlateFor") && renderer.includes("data-a1-type-art-glyph"),
  singleSourceTypeArtPlate: renderer.includes("EditableTypeArtPlate") && renderer.includes("data-a1-type-art-path-glyph") && !renderer.includes("<ArtTypeTreatment"),
};
const warmLegacy = ["#f2efe7", "#f8f5ed", "#ddd8cd", "#d9d5ca", "#2848a8"].filter((token)=>renderer.includes(token));
const rows = Array.isArray(visual?.rows) ? visual.rows : [];
const metrics = rows.map((row)=>row.metrics).filter(Boolean);
const avg = (key)=>metrics.length ? Number((metrics.reduce((sum,item)=>sum+(Number(item[key])||0),0)/metrics.length).toFixed(5)) : 0;
const max = (key)=>metrics.length ? Math.max(...metrics.map((item)=>Number(item[key])||0)) : 0;
const checks = [
  {id:"renderer-v2-markers", pass: markers.aestheticRoot >= 3 && markers.coolPalette && markers.blueGreenLayer && markers.condensedType && markers.coolPlate, evidence: markers},
  {id:"reference-typography-v2-markers", pass: markers.referencePosterType && markers.referenceCinemaType && markers.yellowPosterDefault && markers.redCinemaDefault && markers.cjkDisplayStack && markers.serifFontRegistered && markers.chineseDisplayPoolRegistered && markers.latinDisplayPoolRegistered && markers.latinFontPackRouter && markers.darkroomCropPlate && markers.editableTypeArtPlateGenerator && markers.editableArtTypeTreatment, evidence: markers},
  {id:"legacy-warm-paper-removed", pass: warmLegacy.length === 0, evidence: {warmLegacy}},
  {id:"visual-sample-current-pass", pass: visual?.status === "PASS" && visual?.summary?.failCount === 0, evidence: visual?.summary || null},
  {id:"motion-proof-current-pass", pass: motion?.status === "PASS" && motion?.summary?.failCount === 0, evidence: motion?.summary || null},
  {id:"cool-print-density", pass: avg("nonPaperFraction") >= 0.12 && avg("luminanceStdDev") >= 22 && avg("meanEdgeContrast") >= 2.2, evidence: {averageNonPaperFraction: avg("nonPaperFraction"), averageLuminanceStdDev: avg("luminanceStdDev"), averageMeanEdgeContrast: avg("meanEdgeContrast")}},
  {id:"reference-accent-range", pass: max("cobaltFraction") >= 0.006 && max("greenFraction") >= 0.0008 && max("yellowFraction") <= 0.36, evidence: {maxCobaltFraction: max("cobaltFraction"), maxGreenFraction: max("greenFraction"), maxYellowFraction: max("yellowFraction")}},
];
const blockers = checks.filter((check)=>!check.pass);
const report = {
  contract: "A1StoryboardAestheticV2Contract/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  aestheticThesis: "cool off-white retro print archive, cobalt plus archive green registration, symbolic non-figurative motifs, large editable typography",
  sources,
  summary: {checkCount: checks.length, passCount: checks.filter((check)=>check.pass).length, failCount: blockers.length, visualSampleCount: rows.length},
  checks: checks.map((check)=>({...check, status: check.pass ? "PASS" : "FAIL"})),
  blockers: blockers.map(({id,evidence})=>({id,evidence})),
  nextAction: blockers.length ? "fix-aesthetic-v2-contract-before-visual-upgrade-claim" : "aesthetic-v2-contract-clear",
};
writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({status:report.status, summary:report.summary, reportPath:path.relative(root,path.join(artifactRoot,"report.json")), publicReportPath:path.relative(root,path.join(publicRoot,"report.json")), nextAction: report.nextAction}, null, 2));
if(report.status !== "PASS") process.exitCode = 2;
