#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const sourceRoot = path.join(root, ".codex-artifacts/system-progress-system-line/font-candidates-v1/fonts");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2");
const fontRoot = path.join(outputRoot, "fonts");
const reviewRoot = path.join(outputRoot, "review");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;

const candidates = [
  {
    id: "fusion-bold-pixel",
    label: "Fusion Bold Pixel",
    category: "native-pixel-display",
    recommendationRole: "strict pixel identity",
    license: "OFL-1.1",
    expectedSha256: "bdc2e301b699f1cf82dbfd4b9f9eeebd249ebec91ce2c6af50c65bf9889de7a5",
    localSource: path.join(sourceRoot, "fusion-bold-pixel/upstream-2026.08.11/fusion-bold-pixel-12px-proportional-zh_hans.ttf"),
    fileName: "fusion-bold-pixel-zh-hans.ttf",
    sourceUrl: "https://github.com/TakWolf/fusion-pixel-font",
    sourceCommit: "upstream-2026.08.11",
  },
  {
    id: "douyin-sans-bold",
    label: "Douyin Sans Bold",
    category: "dense-social-video-display",
    recommendationRole: "strong presenter headline",
    license: "OFL-1.1",
    expectedSha256: "fbecfacdfac33982774e301073a8d357a09c698cd3134bb6ddec0f5bfc268fa1",
    fileName: "douyin-sans-bold.ttf",
    downloadUrl: "https://raw.githubusercontent.com/bytedance/fonts/327565b61501d7a6d4902ed6ce417a7bd2ae54e6/DouyinSans/DouyinSansBold.ttf",
    licenseUrl: "https://raw.githubusercontent.com/bytedance/fonts/327565b61501d7a6d4902ed6ce417a7bd2ae54e6/DouyinSans/OFL.txt",
    sourceUrl: "https://github.com/bytedance/fonts",
    sourceCommit: "327565b61501d7a6d4902ed6ce417a7bd2ae54e6",
  },
  {
    id: "frex-sans-gb-bold",
    label: "Frex Sans GB Bold",
    category: "sharp-editorial-grotesk",
    recommendationRole: "clean editorial headline",
    license: "OFL-1.1",
    expectedSha256: "1f9ec1e4ad5f8ca731491a5eec7f4b1bb08ab4c43a3138e90776d3b0bc384055",
    fileName: "frex-sans-gb-bold.ttf",
    downloadUrl: "https://raw.githubusercontent.com/maoken-fonts/flex-sans/24ce50c8327866a1555ab6cd791f282c628761fd/fonts/ttf/FrexSansGB-Bold.ttf",
    licenseUrl: "https://raw.githubusercontent.com/maoken-fonts/flex-sans/24ce50c8327866a1555ab6cd791f282c628761fd/OFL.txt",
    sourceUrl: "https://github.com/maoken-fonts/flex-sans",
    sourceCommit: "24ce50c8327866a1555ab6cd791f282c628761fd",
  },
  {
    id: "lxgw-marker-gothic",
    label: "LXGW Marker Gothic",
    category: "handmade-marker-display",
    recommendationRole: "rare human-emphasis beat",
    license: "OFL-1.1",
    expectedSha256: "9a1e46379442856b9fc64de1d9bd4120903780990e28d99fd6415cadee78a47d",
    fileName: "lxgw-marker-gothic.ttf",
    downloadUrl: "https://raw.githubusercontent.com/lxgw/LxgwMarkerGothic/8c45e4f1a347afc84d1db5b94449a9523da07331/fonts/ttf/LXGWMarkerGothic-Regular.ttf",
    licenseUrl: "https://raw.githubusercontent.com/lxgw/LxgwMarkerGothic/8c45e4f1a347afc84d1db5b94449a9523da07331/OFL.txt",
    sourceUrl: "https://github.com/lxgw/LxgwMarkerGothic",
    sourceCommit: "8c45e4f1a347afc84d1db5b94449a9523da07331",
  },
];

async function ensureRemoteFile(url, file) {
  if (fs.existsSync(file)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font-download-failed:${response.status}:${url}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

async function prepareCandidate(candidate) {
  const file = path.join(fontRoot, candidate.fileName);
  if (!fs.existsSync(file)) {
    if (candidate.localSource) fs.copyFileSync(candidate.localSource, file);
    else await ensureRemoteFile(candidate.downloadUrl, file);
  }
  const pixels = fs.readFileSync(file);
  if (sha256(pixels) !== candidate.expectedSha256) throw new Error(`font-sha-mismatch:${candidate.id}`);
  if (candidate.licenseUrl) await ensureRemoteFile(candidate.licenseUrl, path.join(fontRoot, `${candidate.id}-OFL.txt`));
  const font = fontkit.openSync(file);
  const missingGlyphs = [...new Set([..."觉得不方便的地方可控的工作流完成度很高的废稿"].filter((character) => {
    const glyph = font.layout(character).glyphs[0];
    return !glyph || glyph.id === 0;
  }))];
  if (missingGlyphs.length) throw new Error(`font-missing-required-glyphs:${candidate.id}:${missingGlyphs.join("")}`);
  return {...candidate, file, font, fontMeta: {family: font.familyName, subfamily: font.subfamilyName, glyphCount: font.numGlyphs}};
}

function textPath(font, text, {x, y, size, tracking = 0, scaleX = 1}) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  const paths = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return paths.join("");
}

async function maskedForeground(basePixels, alphaFile) {
  const {data, info} = await sharp(basePixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const alpha = await sharp(alphaFile).resize(info.width, info.height, {fit: "fill"}).extractChannel(3).raw().toBuffer();
  for (let index = 0; index < info.width * info.height; index += 1) data[index * 4 + 3] = alpha[index];
  return sharp(data, {raw: info}).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(fontRoot, {recursive: true});
  fs.mkdirSync(reviewRoot, {recursive: true});
  const workspace = JSON.parse(fs.readFileSync(path.join(phaseRoot, "workspace.json"), "utf8"));
  const board = workspace.production.articleAssetProductionAuthority.defaultLibraryWholeFilmStaticBoardReview;
  const ed31 = board.frames.find((frame) => frame.shotId === "ED-31");
  if (!ed31?.sourcePublicUrl) throw new Error("ed31-presenter-source-required");
  const baseFile = path.join(appRoot, "public", ed31.sourcePublicUrl.replace(/^\//u, ""));
  const alphaFile = path.join(phaseRoot, "whole-film-motion-plan-v1/mattes/ED-31-dynamic-original-video-alpha.png");
  const styleBriefFile = path.join(phaseRoot, "default-design-asset-library-v1/whole-film-static-board-v1/presenter-typography-style-options-v1/style-brief.json");
  const basePixels = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const foreground = await maskedForeground(basePixels, alphaFile);
  const prepared = [];
  for (const candidate of candidates) prepared.push(await prepareCandidate(candidate));
  const renders = [];
  for (const candidate of prepared) {
    const shadow = [
      `<g fill="#05070a" fill-opacity="0.86">${textPath(candidate.font, "觉得不方便的地方", {x: 98, y: 261, size: 124, tracking: -4, scaleX: 0.96})}</g>`,
      `<g fill="#05070a" fill-opacity="0.9">${textPath(candidate.font, "可控的工作流", {x: 182, y: 638, size: 220, tracking: -8, scaleX: 0.94})}</g>`,
    ].join("");
    const title = [
      `<g fill="#b9c9ff">${textPath(candidate.font, "觉得不方便的地方", {x: 92, y: 255, size: 124, tracking: -4, scaleX: 0.96})}</g>`,
      `<g fill="#f4f2eb">${textPath(candidate.font, "可控的工作流", {x: 176, y: 630, size: 220, tracking: -8, scaleX: 0.94})}</g>`,
    ].join("");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${shadow}${title}</svg>`);
    const pixels = await sharp(basePixels).composite([{input: svg}, {input: foreground}]).png({compressionLevel: 9}).toBuffer();
    const file = path.join(reviewRoot, `${candidate.id}-ed31-masked-headline.png`);
    fs.writeFileSync(file, pixels);
    renders.push({candidate, file, pixels, sha256: sha256(pixels)});
  }
  const width = 1920;
  const tileWidth = 920;
  const tileHeight = 518;
  const rowHeight = 580;
  const height = 84 + rowHeight * 2;
  const layers = [];
  const labels = [];
  for (const [index, render] of renders.entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = 20 + column * 950;
    const top = 64 + row * rowHeight;
    layers.push({input: await sharp(render.pixels).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    labels.push(`<text x="${left}" y="${top + tileHeight + 24}" fill="#e8edf0" font-family="monospace" font-size="17">${render.candidate.label} · ${render.candidate.category}</text>`);
  }
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/><text x="20" y="36" fill="#dfff68" font-family="monospace" font-size="20">DISPLAY FONT SCOUT · ACTUAL PRESENTER MASK · REVIEW ONLY · CURRENT AUTHORITY UNCHANGED</text>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheetSvg).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(reviewRoot, "display-font-scout-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const styleBrief = JSON.parse(fs.readFileSync(styleBriefFile, "utf8"));
  const manifestBody = {
    contract: "A1IsolatedDisplayFontScout/v2",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    semanticJob: "find a stronger, better-shaped Chinese display face for presenter headline packaging",
    sourceStyleBriefSha256: styleBrief.styleBriefSha256,
    exactCopy: ["觉得不方便的地方", "可控的工作流"],
    formalTextGeneratedByImageModel: false,
    actualPresenterPixelsUsed: true,
    actualPresenterMatteUsed: true,
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    defaultFontChanged: false,
    candidates: renders.map(({candidate, file, sha256: renderSha256}) => ({
      id: candidate.id,
      label: candidate.label,
      category: candidate.category,
      recommendationRole: candidate.recommendationRole,
      license: candidate.license,
      sourceUrl: candidate.sourceUrl,
      sourceCommit: candidate.sourceCommit,
      fontFile: path.relative(root, candidate.file),
      fontSha256: candidate.expectedSha256,
      font: candidate.fontMeta,
      renderFile: path.relative(root, file),
      renderSha256,
    })),
    reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height},
    createdAt: new Date().toISOString(),
  };
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(canonicalize(manifestBody))))};
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, productionAdmitted: false, reviewSheet: manifest.reviewSheet, candidates: manifest.candidates.map(({id, font, fontSha256, renderSha256}) => ({id, font, fontSha256, renderSha256}))}, null, 2));
}

await main();
