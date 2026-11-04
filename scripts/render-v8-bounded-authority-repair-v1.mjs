#!/usr/bin/env node
// Bounded package-only actual-pixel repair for ED-12/13/17 after independent
// visual review. ED-10/16/31 are byte-preserved. No presenter/base/audio/
// caption pixels and no motion/Resolve.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const canaryVersion = "static-package-review-v8-canary-v7-ed12-legibility-repair";
const expansionVersion = "static-package-review-v8-expansion-batch-01-repair-v4-ed12-legibility";
const canaryRoot = path.join(generatedRoot, canaryVersion);
const expansionRoot = path.join(generatedRoot, expansionVersion);
const priorCanaryRoot = path.join(generatedRoot, "static-package-review-v8-canary-v6-independent-repair");
const priorExpansionRoot = path.join(generatedRoot, "static-package-review-v8-expansion-batch-01-repair-v3");
const canaryCandidateRoot = path.join(generatedRoot, "v8-visual-canary-candidates-v3");
const expansionCandidateRoot = path.join(generatedRoot, "v8-expansion-candidates-v1");
const expansionCandidateV2Root = path.join(generatedRoot, "v8-expansion-candidates-v2");
const W = 1920;
const H = 1080;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const asDataUri = (bytes) => `data:image/png;base64,${bytes.toString("base64")}`;
const fusionPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const sourceHanPath = path.join(publicRoot, "a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const fontRegistry = {
  "a1-fusion-pixel": {path: fusionPath, publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: sha256(fs.readFileSync(fusionPath))},
  "source-han-sans-cn-heavy": {path: sourceHanPath, publicUrl: "/a1-editorial-fonts/SourceHanSansCN-Heavy.otf", sha256: sha256(fs.readFileSync(sourceHanPath))},
};
const referenceRegistry = JSON.parse(fs.readFileSync(path.join(publicRoot, "style-guides/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const referenceTraits = {
  "pinterest-retro-pixel-02": ["use cursor-scale pixel marks as semantic emphasis", "keep poster hierarchy asymmetric rather than dashboard-like"],
  "pinterest-retro-pixel-03": ["assemble one printer-like process actor from functional parts", "show causality with restrained kit-of-parts relationships"],
  "pinterest-retro-pixel-04": ["use error-state hierarchy for decisive judgment", "make process graphics carry a named semantic action"],
  "pinterest-retro-pixel-06": ["use a controlled two-color editorial field", "make dither and pixel texture structural rather than decorative"],
  "pinterest-retro-pixel-07": ["use asymmetric diagram marks to direct attention", "keep halftone texture subordinate to the primary actor"],
  "pinterest-retro-pixel-09": ["use restrained one-bit scene hierarchy", "preserve deep scene detail without heavy interface chrome"],
};
function references(ids) {
  return ids.map((id) => {
    const item = referenceRegistry.sources.find((source) => source.id === id);
    if (!item) throw new Error(`reference-missing:${id}`);
    return {referenceId: id, sha256: item.sha256, publicUrl: item.publicUrl, role: item.role, adoptedTraits: referenceTraits[id]};
  });
}
function node(spec) {
  const font = fontRegistry[spec.fontAssetId];
  const run = buildFontGlyphOutlineRun({fontPath: font.path, text: spec.text});
  const width = Number((run.advance * spec.fontSize / run.unitsPerEm).toFixed(3));
  const geometry = {x: spec.x, baseline: spec.baseline, width, height: spec.fontSize, anchor: spec.anchor === "middle" ? 0 : 1};
  const shared = {fontAssetId: spec.fontAssetId, fontSha256: font.sha256, fontFilePublicUrl: font.publicUrl, fontSize: spec.fontSize, semanticRole: spec.semanticRole};
  return {
    ...spec,
    ...shared,
    geometry,
    proofMethod: "FONTKIT_DIRECT_GLYPH_OUTLINES",
    glyphOutlineSha256: run.outlineSha256,
    rendererBinding: {method: "FONTKIT_DIRECT_GLYPH_OUTLINES", ...shared, textSha256: sha256(Buffer.from(spec.text)), geometry},
    svg: glyphOutlineRunToSvgPaths(run, {x: spec.x, baseline: spec.baseline, fontSize: spec.fontSize, fill: spec.fill, anchor: spec.anchor || "start"}),
  };
}
function publicUrl(version, file) { return `/generated/system-line/editorial-asset-workbench-v1/${version}/${file}`; }
async function alphaStats(bytes) {
  const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let min = 255; let max = 0; let nonzero = 0;
  for (let index = 3; index < data.length; index += info.channels) {const alpha = data[index]; min = Math.min(min, alpha); max = Math.max(max, alpha); if (alpha > 0) nonzero += 1;}
  return {alphaMin: min, alphaMax: max, nonzeroPixelCount: nonzero};
}
function cleanNode(item) { const {svg, ...rest} = item; return rest; }
async function writeOutput({shotId, route, version, outputRoot, bytes, bitmapSha256, sourceCandidateSha256, visibleTextNodes, referenceIds, generationMethod = "BUILT_IN_IMAGEGEN", preservedFrom = null}) {
  const file = path.join(outputRoot, `${shotId}.png`);
  fs.writeFileSync(file, bytes);
  return {
    shotId, route, outputPath: publicUrl(version, `${shotId}.png`), sha256: sha256(bytes), bytes: bytes.length,
    bitmapSha256, sourceCandidateSha256, generationMethod, preservedFrom,
    visibleTextNodes: visibleTextNodes.map(cleanNode), sourceReferences: references(referenceIds), referenceTraitProofs: references(referenceIds),
    containsBaseFootage: false, containsPresenterPixels: false, containsMicrophonePixels: false, containsBoomPixels: false,
    containsAudio: false, containsCaptions: false, ...(await alphaStats(bytes)),
  };
}
async function contactSheet(outputs, outputRoot, version) {
  const tileW = 640; const tileH = 360;
  const layers = await Promise.all(outputs.map(async (output, index) => ({input: await sharp(path.join(outputRoot, `${output.shotId}.png`)).resize(tileW, tileH, {fit: "contain", background: "#eef0f2"}).png().toBuffer(), left: index * tileW, top: 0})));
  const file = path.join(outputRoot, "contact-sheet.png");
  await sharp({create: {width: tileW * outputs.length, height: tileH, channels: 3, background: "#eef0f2"}}).composite(layers).png().toFile(file);
  const bytes = fs.readFileSync(file);
  return {path: publicUrl(version, "contact-sheet.png"), sha256: sha256(bytes), bytes: bytes.length};
}
function manifestBody({contract, version, outputs, contactSheet: sheet}) {
  return {contract, status: "READY_FOR_ACTUAL_PIXEL_REVIEW", reviewOnly: true, productionArtifact: false, packagingDeliverable: false, resolveInsertEligible: false, packageExportAuthorized: false, outputs, contactSheet: sheet, externalIndependentGateRequired: true, automaticGateIsVisualApproval: false, userVisualApproval: "NOT_APPROVED", productionWired: false, motionAllowed: false, resolveMutationPerformed: false, finalFilmRendered: false, outputVersion: version};
}

for (const dir of [canaryRoot, expansionRoot]) {
  if (fs.existsSync(dir)) throw new Error(`bounded-repair-output-already-exists:${dir}`);
  fs.mkdirSync(dir, {recursive: true});
}

const priorCanary = JSON.parse(fs.readFileSync(path.join(priorCanaryRoot, "manifest.json"), "utf8"));
const priorExpansion = JSON.parse(fs.readFileSync(path.join(priorExpansionRoot, "manifest.json"), "utf8"));
const priorOutput = (manifest, shotId) => manifest.outputs.find((item) => item.shotId === shotId);

const ed13Nodes = [
  node({nodeId: "ED-13-v8-1", text: "国产模型写中文确实会顺一些", semanticRole: "support-claim", fontAssetId: "source-han-sans-cn-heavy", fontSize: 34, x: 210, baseline: 142, anchor: "start", fill: "#f4f5f6"}),
  node({nodeId: "ED-13-v8-2", text: "问题也并没有彻底解决", semanticRole: "verdict", fontAssetId: "a1-fusion-pixel", fontSize: 40, x: 210, baseline: 198, anchor: "start", fill: "#4e8cff"}),
];
const ed10Nodes = [node({nodeId: "ED-10-v8-1", text: "完成度很高的废稿", semanticRole: "verdict", fontAssetId: "a1-fusion-pixel", fontSize: 92, x: 140, baseline: 170, anchor: "start", fill: "#17191c"})];
const ed31Nodes = [
  node({nodeId: "ED-31-v8-1", text: "把不便整理成流程", semanticRole: "headline", fontAssetId: "a1-fusion-pixel", fontSize: 76, x: 960, baseline: 142, anchor: "middle", fill: "#17191c"}),
  ...[["整理",610],["编排",910],["读取",1210],["检查",1510]].map(([text,x], index) => node({nodeId: `ED-31-v8-${index + 2}`, text, semanticRole: "stage-label", fontAssetId: "source-han-sans-cn-heavy", fontSize: 48, x, baseline: 812, anchor: "middle", fill: "#17191c"})),
  node({nodeId: "ED-31-v8-6", text: "可控的工作流", semanticRole: "verdict", fontAssetId: "a1-fusion-pixel", fontSize: 58, x: 1510, baseline: 920, anchor: "middle", fill: "#285ec8"}),
];
const ed31Source = path.join(canaryCandidateRoot, "ED-31-workflow-paper-ribbon-imagegen-v8.png");
const ed31Background = await sharp(ed31Source).extract({left: 0, top: 0, width: 1560, height: 941}).resize(W, H, {fit: "fill"}).png().toBuffer();
const ed31Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="${asDataUri(ed31Background)}" width="${W}" height="${H}"/>${ed31Nodes.map(({svg}) => svg).join("")}</svg>`;
const ed31Bytes = await sharp(Buffer.from(ed31Svg)).png().toBuffer();

const ed13Source = path.join(canaryCandidateRoot, "ED-13-overlay-fragments-imagegen-v8-v2.png");
const ed13Decoded = await sharp(ed13Source).extract({left: 90, top: 145, width: 540, height: 450}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
for (let index = 0; index < ed13Decoded.data.length; index += ed13Decoded.info.channels) {
  const red = ed13Decoded.data[index]; const green = ed13Decoded.data[index + 1]; const blue = ed13Decoded.data[index + 2];
  ed13Decoded.data[index + 3] = Math.min(red, green, blue) > 220 ? 0 : 255;
}
const ed13Object = await sharp(ed13Decoded.data, {raw: ed13Decoded.info}).resize(120, 100, {fit: "contain"}).png().toBuffer();
const ed13ShadowNodes = ed13Nodes.map((item) => glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: fontRegistry[item.fontAssetId].path, text: item.text}), {x: item.x + 2, baseline: item.baseline + 2, fontSize: item.fontSize, fill: "#05070a", anchor: item.anchor || "start"}));
const ed13Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="${asDataUri(ed13Object)}" x="66" y="92" width="120" height="100"/>${ed13ShadowNodes.join("")}${ed13Nodes.map(({svg}) => svg).join("")}</svg>`;
const ed13Bytes = await sharp(Buffer.from(ed13Svg)).png().toBuffer();

const canaryOutputs = [];
canaryOutputs.push(await writeOutput({shotId: "ED-13", route: "OVERLAY_ALPHA", version: canaryVersion, outputRoot: canaryRoot, bytes: ed13Bytes, bitmapSha256: sha256(fs.readFileSync(ed13Source)), sourceCandidateSha256: sha256(fs.readFileSync(ed13Source)), visibleTextNodes: ed13Nodes, referenceIds: ["pinterest-retro-pixel-02","pinterest-retro-pixel-06"]}));
for (const [shotId, nodes, ids] of [["ED-10", ed10Nodes, ["pinterest-retro-pixel-04","pinterest-retro-pixel-06"]]]) {
  const old = priorOutput(priorCanary, shotId); const bytes = fs.readFileSync(path.join(priorCanaryRoot, `${shotId}.png`));
  if (sha256(bytes) !== old.sha256) throw new Error(`preserved-canary-sha-mismatch:${shotId}`);
  canaryOutputs.push(await writeOutput({shotId, route: old.route, version: canaryVersion, outputRoot: canaryRoot, bytes, bitmapSha256: old.bitmapSha256, sourceCandidateSha256: old.sourceCandidateSha256, visibleTextNodes: nodes, referenceIds: ids, preservedFrom: {outputVersion: "static-package-review-v8-canary-v6-independent-repair", sha256: old.sha256}}));
}
const oldEd31 = priorOutput(priorCanary, "ED-31"); const oldEd31Bytes = fs.readFileSync(path.join(priorCanaryRoot, "ED-31.png"));
if (sha256(oldEd31Bytes) !== oldEd31.sha256) throw new Error("preserved-canary-sha-mismatch:ED-31");
canaryOutputs.push(await writeOutput({shotId: "ED-31", route: oldEd31.route, version: canaryVersion, outputRoot: canaryRoot, bytes: oldEd31Bytes, bitmapSha256: oldEd31.bitmapSha256, sourceCandidateSha256: oldEd31.sourceCandidateSha256, visibleTextNodes: ed31Nodes, referenceIds: ["pinterest-retro-pixel-03","pinterest-retro-pixel-09"], preservedFrom: {outputVersion: "static-package-review-v8-canary-v6-independent-repair", sha256: oldEd31.sha256}}));
const canarySheet = await contactSheet(canaryOutputs, canaryRoot, canaryVersion);
const canaryManifest = manifestBody({contract: "A1V8BoundedCanaryAuthorityRepair/v1", version: canaryVersion, outputs: canaryOutputs, contactSheet: canarySheet});
fs.writeFileSync(path.join(canaryRoot, "manifest.json"), `${JSON.stringify({...canaryManifest, manifestSha256: sha256(Buffer.from(JSON.stringify(canaryManifest)))}, null, 2)}\n`);

const ed12Nodes = [
  ["我试了 GPT",180,42,"#f4f5f6"],["Claude",340,44,"#f4f5f6"],["Kimi",500,44,"#4e8cff"],["DeepSeek",660,40,"#f4f5f6"],["智谱",820,44,"#f4f5f6"],
].map(([text,baseline,fontSize,fill], index) => node({nodeId: `ED-12-v8-expansion-${index + 1}`, text, semanticRole: index === 0 ? "headline" : "keyword", fontAssetId: "a1-fusion-pixel", fontSize, x: 64, baseline, anchor: "start", fill}));
const ed12Source = path.join(expansionCandidateV2Root, "ED-12-integrated-model-experiment-bench-imagegen-v8.png");
const ed12OutlineSvg = ed12Nodes.flatMap((item) => [[-2,0],[2,0],[0,-2],[0,2]].map(([dx,dy]) => glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: fontRegistry[item.fontAssetId].path, text: item.text}), {x: item.x + dx, baseline: item.baseline + dy, fontSize: item.fontSize, fill: "#05070a", anchor: item.anchor || "start"}))).join("");
const ed12Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="${asDataUri(fs.readFileSync(ed12Source))}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>${ed12OutlineSvg}${ed12Nodes.map(({svg}) => svg).join("")}</svg>`;
const ed12Bytes = await sharp(Buffer.from(ed12Svg)).png().toBuffer();
const ed16Nodes = [["材料不够",470],["角度不清",960],["泛泛而谈",1480]].map(([text,x], index) => node({nodeId: `ED-16-v8-expansion-${index + 1}`, text, semanticRole: "question-label", fontAssetId: "source-han-sans-cn-heavy", fontSize: 52, x, baseline: 720, anchor: "middle", fill: index === 1 ? "#285ec8" : "#f4f5f6"}));
const ed17Nodes = [["先给材料",320,44],["再找角度",960,44],["最后再让 AI 动笔",1500,38]].map(([text,x,fontSize], index) => node({nodeId: `ED-17-v8-expansion-${index + 1}`, text, semanticRole: "stage-label", fontAssetId: "source-han-sans-cn-heavy", fontSize, x, baseline: 980, anchor: "middle", fill: index === 1 ? "#285ec8" : "#17191c"}));
const ed17Source = path.join(expansionCandidateRoot, "ED-17-three-step-gate-imagegen-v8.png");
const ed17Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="${asDataUri(fs.readFileSync(ed17Source))}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/><rect x="0" y="890" width="1920" height="190" fill="#f5f5f4" fill-opacity=".96"/><g fill="none" stroke="#777b80" stroke-width="2"><path d="M150 925v-22h350v22"/><path d="M770 925v-22h380v22"/><path d="M1320 925v-22h440v22"/></g>${ed17Nodes.map(({svg}) => svg).join("")}</svg>`;
const ed17Bytes = await sharp(Buffer.from(ed17Svg)).png().toBuffer();
const expansionOutputs = [];
expansionOutputs.push(await writeOutput({shotId: "ED-12", route: "FULLSCREEN_PACKAGE", version: expansionVersion, outputRoot: expansionRoot, bytes: ed12Bytes, bitmapSha256: sha256(fs.readFileSync(ed12Source)), sourceCandidateSha256: sha256(fs.readFileSync(ed12Source)), visibleTextNodes: ed12Nodes, referenceIds: ["pinterest-retro-pixel-03","pinterest-retro-pixel-06","pinterest-retro-pixel-07"]}));
const oldEd16 = priorOutput(priorExpansion, "ED-16"); const ed16Bytes = fs.readFileSync(path.join(priorExpansionRoot, "ED-16.png"));
if (sha256(ed16Bytes) !== oldEd16.sha256) throw new Error("preserved-expansion-sha-mismatch:ED-16");
expansionOutputs.push(await writeOutput({shotId: "ED-16", route: "FULLSCREEN_PACKAGE", version: expansionVersion, outputRoot: expansionRoot, bytes: ed16Bytes, bitmapSha256: oldEd16.bitmapSha256, sourceCandidateSha256: oldEd16.sourceCandidateSha256, visibleTextNodes: ed16Nodes, referenceIds: ["pinterest-retro-pixel-04","pinterest-retro-pixel-07"], preservedFrom: {outputVersion: "static-package-review-v8-expansion-batch-01-repair-v3", sha256: oldEd16.sha256}}));
expansionOutputs.push(await writeOutput({shotId: "ED-17", route: "FULLSCREEN_PACKAGE", version: expansionVersion, outputRoot: expansionRoot, bytes: ed17Bytes, bitmapSha256: sha256(fs.readFileSync(ed17Source)), sourceCandidateSha256: sha256(fs.readFileSync(ed17Source)), visibleTextNodes: ed17Nodes, referenceIds: ["pinterest-retro-pixel-03","pinterest-retro-pixel-09"]}));
const expansionSheet = await contactSheet(expansionOutputs, expansionRoot, expansionVersion);
const expansionManifest = manifestBody({contract: "A1V8BoundedExpansionAuthorityRepair/v1", version: expansionVersion, outputs: expansionOutputs, contactSheet: expansionSheet});
fs.writeFileSync(path.join(expansionRoot, "manifest.json"), `${JSON.stringify({...expansionManifest, manifestSha256: sha256(Buffer.from(JSON.stringify(expansionManifest)))}, null, 2)}\n`);

console.log(JSON.stringify({status: "READY_FOR_ACTUAL_PIXEL_REVIEW", canaryVersion, expansionVersion, canaryContactSheet: canarySheet, expansionContactSheet: expansionSheet, preservedPixelParity: {"ED-10": priorOutput(priorCanary, "ED-10").sha256, "ED-16": oldEd16.sha256, "ED-31": oldEd31.sha256}, repairedShotIds: ["ED-12","ED-13","ED-17"], userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveMutationPerformed: false, finalFilmRendered: false}, null, 2));
