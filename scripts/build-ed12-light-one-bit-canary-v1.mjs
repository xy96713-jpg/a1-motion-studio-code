#!/usr/bin/env node
// One-shot review-only ED-12 canary. No motion, Resolve, production export, or
// final-film render. ImageGen owns the clean one-bit scene; local code owns all
// readable text and actual-pixel QA.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const sourcePath = "/Users/a1/.codex/generated_images/019fef56-00d7-7730-8438-a0defb1a1a98/exec-5e9853e2-b88e-4e4d-8c3b-bbd525af6239.png";
const sourceSha256 = "b8fcc450512c3952fc453639a92aeb18f1d2fd331666200de24b06f8210154ad";
const candidateId = "v8-ed12-light-one-bit-candidate-v3";
const outputId = "static-package-review-v8-ed12-light-one-bit-canary-v3";
const candidateRoot = path.join(generatedRoot, candidateId);
const outputRoot = path.join(generatedRoot, outputId);
const candidatePath = path.join(candidateRoot, "ED-12-light-one-bit-test-rail-imagegen-v1.png");
const W = 1920;
const H = 1080;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stableHash = (value) => sha256(Buffer.from(JSON.stringify(value)));
const publicUrl = (id, file) => `/generated/system-line/editorial-asset-workbench-v1/${id}/${file}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const sourceBytes = fs.readFileSync(sourcePath);
assert(sha256(sourceBytes) === sourceSha256, "ed12-light-source-sha-mismatch");
for (const dir of [candidateRoot, outputRoot]) {
  assert(!fs.existsSync(dir), `ed12-light-output-already-exists:${dir}`);
  fs.mkdirSync(dir, {recursive: true});
}
fs.copyFileSync(sourcePath, candidatePath);
assert(sha256(fs.readFileSync(candidatePath)) === sourceSha256, "ed12-light-candidate-copy-sha-mismatch");

const fusionPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const sourceHanPath = path.join(publicRoot, "a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const fonts = {
  "a1-fusion-pixel": {path: fusionPath, publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: sha256(fs.readFileSync(fusionPath))},
  "source-han-sans-cn-heavy": {path: sourceHanPath, publicUrl: "/a1-editorial-fonts/SourceHanSansCN-Heavy.otf", sha256: sha256(fs.readFileSync(sourceHanPath))},
};
function textNode(spec) {
  const font = fonts[spec.fontAssetId];
  const run = buildFontGlyphOutlineRun({fontPath: font.path, text: spec.text});
  const width = Number((run.advance * spec.fontSize / run.unitsPerEm).toFixed(3));
  const geometry = {x: spec.x, baseline: spec.baseline, width, height: spec.fontSize, anchor: spec.anchor || "middle"};
  return {
    ...spec,
    fontSha256: font.sha256,
    fontFilePublicUrl: font.publicUrl,
    proofMethod: "FONTKIT_DIRECT_GLYPH_OUTLINES",
    glyphOutlineSha256: run.outlineSha256,
    textSha256: sha256(Buffer.from(spec.text)),
    geometry,
    svg: glyphOutlineRunToSvgPaths(run, {x: spec.x, baseline: spec.baseline, fontSize: spec.fontSize, fill: spec.fill, anchor: spec.anchor || "middle"}),
  };
}

const nodes = [
  textNode({nodeId: "ED-12-light-title", text: "我试了 5 个模型", semanticRole: "headline", fontAssetId: "a1-fusion-pixel", fontSize: 74, x: 1050, baseline: 350, anchor: "start", fill: "#151719"}),
  ...[["GPT",270],["Claude",345],["Kimi",420],["DeepSeek",495],["智谱",570]].map(([text, baseline], index) => textNode({nodeId: `ED-12-light-model-${index + 1}`, text, semanticRole: "stage-label", fontAssetId: "a1-fusion-pixel", fontSize: index === 3 ? 30 : 34, x: 665, baseline, anchor: "middle", fill: index === 2 ? "#245ee8" : "#151719"})),
];
const background = await sharp(candidatePath).resize(W, H, {fit: "fill", kernel: sharp.kernel.nearest}).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="data:image/png;base64,${background.toString("base64")}" width="${W}" height="${H}"/>${nodes.map(({svg: paths}) => paths).join("")}</svg>`;
const outputBytes = await sharp(Buffer.from(svg)).png().toBuffer();
const outputPath = path.join(outputRoot, "ED-12.png");
fs.writeFileSync(outputPath, outputBytes);

const {data, info} = await sharp(outputBytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
const pixelCount = info.width * info.height;
let dark = 0;
let accent = 0;
const quietMask = new Uint8Array(pixelCount);
for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += info.channels) {
  const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
  if ((r + g + b) / 3 < 72) dark += 1;
  if (b > 150 && b > r + 45 && b > g + 20) accent += 1;
  if (r > 238 && g > 238 && b > 238 && Math.max(r, g, b) - Math.min(r, g, b) < 14) quietMask[pixel] = 1;
}
const seen = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let largestQuiet = 0;
for (let start = 0; start < pixelCount; start += 1) {
  if (!quietMask[start] || seen[start]) continue;
  let head = 0; let tail = 0; let count = 0;
  queue[tail++] = start; seen[start] = 1;
  while (head < tail) {
    const current = queue[head++]; count += 1;
    const x = current % W; const y = Math.floor(current / W);
    const neighbors = [x > 0 ? current - 1 : -1, x + 1 < W ? current + 1 : -1, y > 0 ? current - W : -1, y + 1 < H ? current + W : -1];
    for (const next of neighbors) if (next >= 0 && quietMask[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
  }
  largestQuiet = Math.max(largestQuiet, count);
}
const actualPixelQa = {
  width: info.width,
  height: info.height,
  darkCoveragePercent: Number((dark / pixelCount * 100).toFixed(4)),
  accentCoveragePercent: Number((accent / pixelCount * 100).toFixed(4)),
  largestConnectedQuietFieldPercent: Number((largestQuiet / pixelCount * 100).toFixed(4)),
  maxHeavyBlackCoveragePercent: 35,
  maxAccentCoveragePercent: 8,
  minimumConnectedQuietFieldPercent: 35,
};
assert(actualPixelQa.darkCoveragePercent < actualPixelQa.maxHeavyBlackCoveragePercent, "ed12-light-dark-coverage-failed");
assert(actualPixelQa.accentCoveragePercent < actualPixelQa.maxAccentCoveragePercent, "ed12-light-accent-coverage-failed");
assert(actualPixelQa.largestConnectedQuietFieldPercent >= actualPixelQa.minimumConnectedQuietFieldPercent, "ed12-light-quiet-field-failed");

const reference = {
  referenceId: "pinterest-retro-pixel-09",
  sha256: "44ef5e0a4ae8d819bbf1e8c2fa0f376b7bd07722b1a9dd62ef99aa0426530c87",
  publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-09-light-one-bit-story-b.jpg",
  role: "lightweight one-bit world composition with restrained interface hierarchy",
  adoptedTraits: ["one continuous monochrome one-bit scene", "thin interface hierarchy", "line-density depth with a dominant quiet field"],
};
const styleBrief = {
  contract: "A1CrtPixelEditorialFusionBrief/v1",
  shotId: "ED-12",
  semanticAction: "five candidate models share one test rail and one cursor selection event",
  fusionMode: "crt-menu-verdict",
  primaryFamily: "pixel-type-actor",
  visualWeight: {profile: "light-one-bit-story-screen-v1", interfaceChrome: "thin", maxControlRegions: 2, sceneLedTitleMaxHeightPercent: 18, maxHeavyBlackCoveragePercent: 35, maxAccentCoveragePercent: 8},
  surfacePolicy: {backgroundTone: "neutral-white", yellowCastForbidden: true, warmBackgroundUserApproved: false},
  fusionEntanglement: {sharedActor: "the five input states, cursor, and verdict share one continuous test rail", separableStylesForbidden: true},
  interfaceJobs: [{element: "selection-cursor", job: "mark the single candidate currently under evaluation"}],
  titleJob: "state that five models were tried without becoming the primary scene",
  referenceBoundary: "abstract-grammar-only",
  sourceReferences: [reference],
  prohibited: ["3D", "isometric-machine", "paper-material", "dashboard", "HUD", "generated-readable-text", "warm-paper"],
};
styleBrief.styleBriefSha256 = stableHash(styleBrief);
fs.writeFileSync(path.join(candidateRoot, "style-brief.json"), `${JSON.stringify(styleBrief, null, 2)}\n`);
const candidateManifest = {
  contract: "A1Ed12LightOneBitImagegenCandidate/v3",
  status: "REVIEW_ASSET_CANDIDATE_ONLY",
  shotId: "ED-12",
  sourceProvider: "built-in-imagegen",
  sourcePath,
  sourceSha256,
  candidatePath: publicUrl(candidateId, path.basename(candidatePath)),
  candidateSha256: sha256(fs.readFileSync(candidatePath)),
  containsReadableText: false,
  containsPresenterPixels: false,
  containsBaseFootage: false,
  containsAudio: false,
  containsCaptions: false,
  styleBriefSha256: styleBrief.styleBriefSha256,
  geometryBenchmark: {path: "/Users/a1/.codex/generated_images/019fef52-dee2-73f1-9e2d-53cec9b0b4ae/exec-234de781-c7da-44b6-9542-acc4defdaf0a.png", sha256: "06375d203a771cb6927274f46d899eaf9cea7e351acdda4f473a041448d58e70", role: "NON_PRODUCTION_GEOMETRY_STYLE_BENCHMARK", productionPixelSource: false},
};
candidateManifest.manifestSha256 = stableHash(candidateManifest);
fs.writeFileSync(path.join(candidateRoot, "manifest.json"), `${JSON.stringify(candidateManifest, null, 2)}\n`);

const visibleTextNodes = nodes.map(({svg: _svg, ...item}) => item);
const manifest = {
  contract: "A1Ed12LightOneBitStaticCanary/v3",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  reviewOnly: true,
  productionArtifact: false,
  packagingDeliverable: false,
  shotId: "ED-12",
  route: "FULLSCREEN_PACKAGE",
  outputPath: publicUrl(outputId, "ED-12.png"),
  outputSha256: sha256(outputBytes),
  outputBytes: outputBytes.length,
  candidateSha256: sourceSha256,
  generationMethod: "BUILT_IN_IMAGEGEN_LOOK_MASTER_PLUS_LOCAL_GLYPH_OUTLINES",
  containsBaseFootage: false,
  containsPresenterPixels: false,
  containsMicrophonePixels: false,
  containsBoomPixels: false,
  containsAudio: false,
  containsCaptions: false,
  visibleTextNodes,
  sourceReferences: [reference],
  referenceTraitProofs: [reference],
  actualPixelQa,
  styleBriefSha256: styleBrief.styleBriefSha256,
  automaticGateIsVisualApproval: false,
  userVisualApproval: "NOT_APPROVED",
  productionWired: false,
  motionAllowed: false,
  resolveInsertAllowed: false,
  finalFilmRenderAllowed: false,
};
manifest.manifestSha256 = stableHash(manifest);
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputId, outputPath: manifest.outputPath, outputSha256: manifest.outputSha256, sourceSha256, actualPixelQa, styleBriefSha256: styleBrief.styleBriefSha256, userVisualApproval: manifest.userVisualApproval}, null, 2));
