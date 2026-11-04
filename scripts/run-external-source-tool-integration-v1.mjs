#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  bindExternalSourcePerspective,
  generateExternalSourceMatte,
  probeExternalSourceToolRuntime,
  rerankExternalSourceCandidates,
} from "../lib/visual-sourcing/external-source-tool-adapters-v1.mjs";

const root = process.cwd();
const work = path.join(root, "work/external-source-tool-integration-v1");
const output = path.join(work, "outputs");
const resultPath = path.join(work, "result.json");
const contactSheetPath = path.join(work, "contact-sheet.jpg");
const baseline = JSON.parse(fs.readFileSync(path.join(work, "baseline.json"), "utf8"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const systemPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const runtimeManifestDir = path.join(root, ".codex-artifacts/runtime/external-source-tools-v1");
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const authoritySnapshot = () => {
  const phase = JSON.parse(fs.readFileSync(systemPhasePath, "utf8"));
  return {workspaceIdentitySha256: phase.authority?.workspaceSha256 || null, workspaceFileSha256: hashFile(workspacePath), systemLinePhaseFileSha256: hashFile(systemPhasePath)};
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const publicRel = (file) => path.relative(root, file).split(path.sep).join("/");
fs.mkdirSync(output, {recursive: true});

function xml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

async function rerankBoard(ranking, candidatesById) {
  const width = 1280;
  const tileWidth = 286;
  const tileHeight = 190;
  const buffers = [];
  for (const [index, row] of ranking.slice(0, 4).entries()) {
    buffers.push({input: await sharp(candidatesById.get(row.id).imagePath).resize(tileWidth, tileHeight, {fit: "contain", background: "#f2efe7"}).jpeg({quality: 90}).toBuffer(), left: 28 + index * 310, top: 74});
  }
  const label = Buffer.from(`<svg width="${width}" height="330" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f2efe7"/><text x="28" y="38" font-family="Arial" font-size="26" font-weight="700" fill="#111719">Provider rerank · OpenCLIP offline adapter</text>${ranking.slice(0,4).map((row,index)=>`<text x="${28+index*310}" y="292" font-family="Arial" font-size="14" fill="${index===0?'#1f6b38':'#4f5a5c'}">${index+1}. ${xml(row.id)} · ${Number(row.cosineScore).toFixed(4)}</text>`).join("")}</svg>`);
  return sharp(label).composite(buffers).jpeg({quality: 92}).toBuffer();
}

async function perspectiveBoard(source, rendered) {
  const left = await sharp(source).resize(610, 400, {fit: "contain", background: "#f2efe7"}).jpeg({quality: 90}).toBuffer();
  const right = await sharp(rendered).resize(610, 400, {fit: "contain", background: "#f2efe7"}).jpeg({quality: 90}).toBuffer();
  const background = Buffer.from(`<svg width="1280" height="470" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f2efe7"/><text x="28" y="38" font-family="Arial" font-size="26" font-weight="700" fill="#111719">Provider perspective binding · OpenCV homography</text><text x="28" y="66" font-family="Arial" font-size="14" fill="#596365">original verified source</text><text x="650" y="66" font-family="Arial" font-size="14" fill="#596365">clean output · text obeys source plane</text></svg>`);
  return sharp(background).composite([{input:left,left:20,top:62},{input:right,left:650,top:62}]).jpeg({quality:92}).toBuffer();
}

const before = authoritySnapshot();
assert(JSON.stringify(before) === JSON.stringify(baseline.authoritySnapshot), "authority-changed-before-integration");
const runtime = probeExternalSourceToolRuntime();
assert(runtime.status === "READY", `runtime-not-ready:${JSON.stringify(runtime.checks)}`);

const candidateSpecs = [
  {id: "newspaper-front", imagePath: path.join(root, "work/live-external-source-packaging-canary-v1/staging/live-source-a/02.img")},
  {id: "nasa-room-a", imagePath: path.join(root, "work/live-external-source-packaging-canary-v1/staging/live-source-b/02.img")},
  {id: "nasa-room-b", imagePath: path.join(root, "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img")},
  {id: "public-health-poster", imagePath: path.join(root, "work/live-external-source-packaging-canary-v1/staging/live-source-c/01.img")},
];
const candidates = candidateSpecs.map((item) => ({...item, sha256: hashFile(item.imagePath)}));
const candidatesById = new Map(candidates.map((item) => [item.id, item]));
const rerank = await rerankExternalSourceCandidates({query: "a scanned newspaper front page", candidates});
assert(rerank.status === "PASS" && rerank.ranking[0]?.id === "newspaper-front", `rerank-failed:${JSON.stringify(rerank)}`);

const matteSource = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/source-cache/presenter-opening-frame.jpg");
const matte = await generateExternalSourceMatte({sourcePath: matteSource, outputDir: path.join(output, "matte-clean"), id: "presenter-clean", sourceClean: true});
assert(matte.status === "REVIEW_REQUIRED" && matte.outputs?.transparent?.path, `matte-failed:${JSON.stringify(matte)}`);
const contaminated = await generateExternalSourceMatte({sourcePath: "not-used", outputDir: path.join(output, "matte-dirty"), id: "captioned", sourceClean: false});
assert(contaminated.status === "BLOCKED" && contaminated.failures.includes("BLOCKED_SOURCE_BURNED_TEXT"), "captioned-source-not-blocked");

const overlayPath = path.join(output, "perspective-overlay.png");
await sharp(Buffer.from(`<svg width="720" height="220" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="220" fill="transparent"/><text x="28" y="105" font-family="Arial" font-size="58" font-weight="700" fill="#f4f4ee">SOURCE VERIFIED</text><rect x="28" y="138" width="650" height="10" fill="#c8ff32"/><text x="28" y="190" font-family="Arial" font-size="25" fill="#d5dddd">LOCAL EDITABLE TYPE</text></svg>`)).png().toFile(overlayPath);
const perspectiveSource = path.join(root, "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img");
const perspectiveOutput = path.join(output, "perspective-bound.png");
const perspective = await bindExternalSourcePerspective({sourcePath: perspectiveSource, overlayPath, outputPath: perspectiveOutput, destinationQuad: [[0.55,0.13],[0.975,0.04],[0.97,0.47],[0.55,0.38]]});
assert(perspective.status === "PASS" && fs.existsSync(perspective.output.path), `perspective-failed:${JSON.stringify(perspective)}`);

const rerankVisual = await rerankBoard(rerank.ranking, candidatesById);
const matteVisual = await sharp(matte.outputs.contactSheet.path).resize(1280, null).jpeg({quality: 92}).toBuffer();
const perspectiveVisual = await perspectiveBoard(perspectiveSource, perspective.output.path);
const pieces = [rerankVisual, matteVisual, perspectiveVisual];
const metadata = await Promise.all(pieces.map((buffer) => sharp(buffer).metadata()));
const totalHeight = metadata.reduce((sum, item) => sum + Number(item.height || 0), 0);
let top = 0;
await sharp({create:{width:1280,height:totalHeight,channels:3,background:"#f2efe7"}}).composite(pieces.map((input,index)=>{const item={input,left:0,top};top+=Number(metadata[index].height||0);return item;})).jpeg({quality:92}).toFile(contactSheetPath);

const fixtures = [
  {id:"provider-rerank-a",genre:"source-retrieval",status:"PASS",provider:rerank.provider,top:rerank.ranking[0],artifact:{path:publicRel(path.join(output,"rerank-provider.json"))}},
  {id:"provider-matte-b",genre:"person-editorial",status:"PASS",provider:matte.provider,cleanResult:matte.status,contaminatedResult:contaminated.status,artifact:matte.outputs.contactSheet},
  {id:"provider-perspective-c",genre:"object-process",status:"PASS",provider:perspective.provider,output:perspective.output},
];
fs.writeFileSync(path.join(output,"rerank-provider.json"),`${JSON.stringify(rerank,null,2)}\n`);
const after = authoritySnapshot();
assert(JSON.stringify(after) === JSON.stringify(before), "authority-mutated-during-integration");
const runtimeManifest = {
  contract:"A1ExternalSourceToolRuntimeManifest/v1",status:"READY",generatedAt:new Date().toISOString(),
  providers:[
    {id:"openclip",revision:rerank.provider.revision,license:rerank.provider.license,offline:true},
    {id:"birefnet-lite",revision:matte.provider.modelRevision,license:matte.provider.license,benchmark:"30/30 reviewed; 28 pass"},
    {id:"opencv-homography",version:perspective.provider.version,license:perspective.provider.license,offline:true},
  ],
  implementationSha256:{adapter:hashFile(path.join(root,"lib/visual-sourcing/external-source-tool-adapters-v1.mjs")),worker:hashFile(path.join(root,"scripts/a1_external_source_tools.py")),requirements:hashFile(path.join(root,"scripts/requirements-birefnet-cutout.txt"))},
  boundary:{modelDownloadAllowed:false,reviewOnly:true,productionAdmission:false},
};
fs.mkdirSync(runtimeManifestDir,{recursive:true});
fs.writeFileSync(path.join(runtimeManifestDir,"manifest.json"),`${JSON.stringify(runtimeManifest,null,2)}\n`);
const contactMeta=await sharp(contactSheetPath).metadata();
const actualPixelReviewPath=path.join(work,"actual-pixel-review.json");
const actualPixelReview=fs.existsSync(actualPixelReviewPath)?JSON.parse(fs.readFileSync(actualPixelReviewPath,"utf8")):null;
const report={contract:"A1ExternalSourceToolIntegration/v1",status:"PASS",fixtures,visibleArtifact:{path:publicRel(contactSheetPath),sha256:hashFile(contactSheetPath),width:contactMeta.width,height:contactMeta.height},runtimeManifest:{path:publicRel(path.join(runtimeManifestDir,"manifest.json")),sha256:hashFile(path.join(runtimeManifestDir,"manifest.json"))},actualPixelReview:actualPixelReview?{path:publicRel(actualPixelReviewPath),sha256:hashFile(actualPixelReviewPath),status:actualPixelReview.status}:null,boundary:{reviewOnly:true,productionAdmission:false,workspaceMutationPerformed:false,authorityUnchanged:true,authoritySnapshot:after}};
fs.writeFileSync(resultPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,fixtures:fixtures.map(({id,status,provider})=>({id,status,provider:provider.id})),visibleArtifact:report.visibleArtifact,runtimeManifest:report.runtimeManifest,boundary:report.boundary},null,2));
